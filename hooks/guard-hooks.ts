import type { EngineInterface, On } from 'claude-code'

import type { Risk } from './guard'
import type { Discard } from './guard'
import { commandDir, dataResets, discards, expandedHeredoc, forcePushes, hostPath, isAbsolute, isDefaultBranch, isProse, misEscapedCjk, quotesUser, recursiveDeletes, resolvePath, rootLike, scriptNamesModel, shellRisks, writtenFile } from './guard'
import { encodingNote, encodingOf } from './encoding'
import { asEditLog, prune, recentEdit, remember } from './edits'
import { commandHead } from './background'
import { zhTwFixes } from './hans'
import type { Term } from './glossary'
import { glossaryHits, parseGlossary } from './glossary'
import type { Rule } from './i18n'
import { platformOf } from './platform'
import { session, t } from './session'

// Guards for long multi-agent runs: a subagent's or workflow agent's tool call carries an agentId.
const AGENTS_QUIET_MS = 180_000
const AGENT_MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const
type AgentModel = (typeof AGENT_MODELS)[number]

let lastAgentCall = -Infinity
let guardGit = true
let agentModel: AgentModel | 'choose' | 'auto' | undefined

const PICK = 'haiku for quick mechanical work (search, renames, formatting), sonnet for routine edits, opus for hard reasoning, design or review, fable for the hardest and longest work where quality outweighs speed and cost'
let requireUserQuote = false
let guardCjk = true
let guardHans = 'auto'
let guardHeredoc = true
let guardGlossary = false
let guardEncoding = true
let guardData = true
let guardSessions = true
let stashBeforeDiscard = false
let glossary: { root: string; terms: Term[] } | undefined
// Calls refused by a rule that can misjudge intent, by rule and call, with when: the same call sent
// again within the window goes through, and calls refused in between do not reset each other.
const REFUSED_FOR_MS = 600_000
const refusedOnce = new Map<string, number>()
const mainTrees = new Map<string, boolean>()

const RISK_REASONS: Record<Risk, string> = {
  'tree-rewrite': 'it rewrites the shared main working tree while agents are running; other agents and the person lose uncommitted work. Use a separate `git worktree add` (with its own install) or recorded numbers instead',
  'stage-all': "it stages every change while agents are running, which can commit another agent's half-done or reverted files. Stage the files you edited by path",
  'link-node-modules': 'a junction or symlink to node_modules lets a recursive delete (git worktree remove, rm -rf) follow it into the main repo. Run the install inside the worktree instead',
}

// A path as the command would see it: absolute as given, else under the command's cd / git -C, else the session's directory.
// Windows sets USERPROFILE and, outside Git Bash, no HOME.
const homeDir = () => session.env.HOME ?? session.env.USERPROFILE
const onWindows = () => platformOf(session.env) === 'windows'

async function resolveIn($: EngineInterface, command: string, path?: string): Promise<string> {
  const cwd = await $.session.cwd()
  const host = (p: string) => hostPath(p, homeDir(), onWindows())
  const named = commandDir(command)
  const dir = named === undefined ? cwd : isAbsolute(host(named)) ? host(named) : `${cwd}/${named}`
  return path === undefined ? dir : isAbsolute(host(path)) ? host(path) : `${dir}/${path}`
}

// Whether a recursive delete of the path would follow a link into another tree: the path is itself a
// link, or on Windows holds a junction, which rmdir /s and git follow; rm and git on other systems unlink
// a symlink inside a tree without entering it. Unknown when the Windows listing did not finish.
async function holdsLink($: EngineInterface, path: string): Promise<'yes' | 'no' | 'unknown'> {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat === undefined) return 'no'
  if (stat.isLink) return 'yes'
  if (stat.kind !== 'dir' || !onWindows()) return 'no'
  // cmd reads its whole line again, so a path holding its operators would run them before the call is
  // even approved; such a path is left unlisted.
  if (/[&|<>^%!"]/.test(path)) return 'unknown'
  const run = await $.process.run(['cmd', '/c', 'dir', '/AL', '/S', '/B', path.replace(/\//g, '\\')], { timeoutMs: 8_000 }).catch(() => undefined)
  // dir exits 1 with nothing listed when there is no link (its message is in the system's language); a
  // timeout rejects, so it never gets here.
  if (run === undefined) return 'unknown'
  if (run.stdout.trim() !== '') return 'yes'
  return run.exitCode === 0 || run.exitCode === 1 ? 'no' : 'unknown'
}

async function currentBranch($: EngineInterface, command: string): Promise<string | undefined> {
  const run = await $.process.run(['git', '-C', await resolveIn($, command), 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5_000 }).catch(() => undefined)
  return run?.exitCode === 0 ? run.stdout.trim() : undefined
}

async function isMainTree($: EngineInterface, command: string): Promise<boolean> {
  const dir = await resolveIn($, command)
  if (!mainTrees.has(dir)) {
    const run = await $.process.run(['git', '-C', dir, 'rev-parse', '--git-dir', '--git-common-dir'], { timeoutMs: 5_000 }).catch(() => undefined)
    const [gitDir = '', commonDir = ''] = (run?.stdout ?? '').trim().split(/\r?\n/)
    mainTrees.set(dir, run?.exitCode === 0 && resolvePath(dir, gitDir) === resolvePath(dir, commonDir))
  }
  return mainTrees.get(dir) ?? false
}

// The files a discarding git call would lose, as git itself lists them; empty when nothing would be lost
// or git cannot say.
async function lostFiles($: EngineInterface, command: string, discard: Discard): Promise<string[]> {
  const dir = await resolveIn($, command)
  const argv =
    discard.verb === 'reset'
      ? ['status', '--porcelain', '--untracked-files=no']
      : discard.verb === 'clean'
        ? // -n last, so a --no-dry-run among the arguments cannot turn the preview into the delete.
          ['clean', ...discard.args.map(f => f.replace(/^--force$/, '').replace(/^(-\w*?)f/, '$1')).filter(f => f !== '' && f !== '-'), '-n']
        : ['diff', '--name-only', '--', ...discard.args]
  const run = await $.process.run(['git', '-C', dir, ...argv], { timeoutMs: 5_000 }).catch(() => undefined)
  if (run?.exitCode !== 0) return []
  const lines = run.stdout.split(/\r?\n/).filter(l => l.trim() !== '')
  return discard.verb === 'reset' ? lines.map(l => l.slice(3)) : discard.verb === 'clean' ? lines.map(l => l.replace(/^Would remove /, '')) : lines
}

// The deny is the guard; a toast that throws must not turn it into a pass through the hook's .catch.
function refuse($: EngineInterface, rule: Rule, reason: string, reminded = false) {
  try {
    $.ui.toast(reminded ? t().reminded(rule) : t().blocked(rule))
  } catch {
    /* the deny still goes out */
  }
  return { deny: `tessera blocked this call: ${reason}.` }
}

async function refuseOnce($: EngineInterface, key: string, rule: Rule, reason: string) {
  const now = await $.clock.now()
  const id = `${rule}\n${key}`
  const refusedAt = refusedOnce.get(id)
  refusedOnce.delete(id)
  if (refusedAt !== undefined && now - refusedAt < REFUSED_FOR_MS) return undefined
  for (const [other, at] of refusedOnce) if (now - at >= REFUSED_FOR_MS) refusedOnce.delete(other)
  refusedOnce.set(id, now)
  return refuse($, rule, `${reason}, send the same call again unchanged and it goes through`, true)
}

// The tree guard's refusals come first, so a reminder that was answered cannot let one through. Then
// every reminder the command earns is gathered into one, answered by one resend: given one at a time,
// two hits of one rule in a command (two discards) would be refused forever, and hits of several rules
// would take a resend each.
async function judgeShell($: EngineInterface, command: string, agentId: string | undefined) {
  if (!guardGit && !guardData) return undefined
  const reminders: { rule: Rule; reason: string }[] = []
  let discarded = false
  if (guardGit) {
    const risks = shellRisks(command)
    if (risks.includes('link-node-modules')) return refuse($, 'node_modules link', RISK_REASONS['link-node-modules'])
    const deletes: { target: string; linked: 'yes' | 'no' | 'unknown' }[] = []
    for (const target of recursiveDeletes(command)) {
      const path = await resolveIn($, command, target)
      if (rootLike(path, await $.session.cwd(), homeDir(), onWindows()))
        return refuse($, 'root delete', `it deletes ${target} recursively, and that is the root, a drive, your home directory, or the directory this session works in or one above it. Name the directory meant`)
      deletes.push({ target, linked: await holdsLink($, path) })
    }
    const through = deletes.find(d => d.linked === 'yes')
    if (through !== undefined)
      return refuse($, 'delete through a link', `it deletes ${through.target} recursively and ${through.target} is or holds a junction or symlink, so the delete can follow it into another tree (git worktree remove and rm -rf both do). List the links (dir /AL /S /B on Windows, find -type l elsewhere), remove each link itself first (rmdir <link> on Windows, rm <link> elsewhere, no recursion), then delete`)
    const shared = risks.filter(r => r !== 'link-node-modules')
    const agentsRunning = shared.length > 0 && (agentId !== undefined || (await $.clock.now()) - lastAgentCall < AGENTS_QUIET_MS)
    if (agentsRunning && (await isMainTree($, command))) {
      const risk = shared[0] as Risk
      return refuse($, risk === 'stage-all' ? 'git add -A' : 'git tree rewrite', RISK_REASONS[risk])
    }
    for (const { target } of deletes.filter(d => d.linked === 'unknown'))
      reminders.push({ rule: 'delete through a link', reason: `it deletes ${target} recursively and the check for junctions inside it (dir /AL /S /B) could not be made, so a junction there could carry the delete into another tree. Check it yourself, or` })
    // Sometimes intended, such as cleaning up a fresh repository.
    for (const branch of forcePushes(command)) {
      const target = branch ?? (await currentBranch($, command))
      if (target !== undefined && isDefaultBranch(target))
        reminders.push({ rule: 'force push', reason: `it force-pushes to ${target}, rewriting history that others and CI build on. Push a branch and merge it instead. If rewriting ${target} is intended` })
    }
    // Discarding is often what the person asked for, so the reminder names what goes.
    for (const discard of discards(command)) {
      const lost = await lostFiles($, command, discard)
      if (lost.length === 0) continue
      discarded ||= discard.verb !== 'clean'
      const named = `${lost.slice(0, 8).join(', ')}${lost.length > 8 ? ` and ${lost.length - 8} more` : ''}`
      reminders.push({ rule: 'discard changes', reason: `it throws away uncommitted work that git cannot bring back: ${discard.verb === 'clean' ? 'untracked files' : 'changes to'} ${named}. Commit or \`git stash\` them first, or narrow the command to the files meant. If discarding them is intended` })
    }
  }
  // A database reset is routine on a development machine and a loss anywhere else; the person knows which.
  if (guardData)
    for (const reset of dataResets(command))
      reminders.push({ rule: 'data reset', reason: `it runs ${reset}, which throws away a database or its volumes and everything in them. For a development database meant to be reset, go ahead; for anything shared or holding real data, ask the person first. If resetting it is intended` })
  const first = reminders[0]
  if (first === undefined) return undefined
  const reminded = await refuseOnce($, `${reminders.map(r => r.rule).join('+')}\n${command}`, first.rule, reminders.map(r => r.reason).join('; and '))
  if (reminded !== undefined) return reminded
  if (stashBeforeDiscard && discarded) await stashSnapshot($, command)
  return undefined
}

// A stash entry holding the tracked changes a discard is about to throw away: `git stash create` writes
// the commit without touching the tree, `git stash store` lists it, so `git stash pop` brings it back.
// Untracked files are not in it, so `git clean` gets no snapshot.
async function stashSnapshot($: EngineInterface, command: string) {
  const dir = await resolveIn($, command)
  const created = await $.process.run(['git', '-C', dir, 'stash', 'create'], { timeoutMs: 10_000 }).catch(() => undefined)
  const sha = created?.exitCode === 0 ? created.stdout.trim() : ''
  const stored = sha === '' ? undefined : await $.process.run(['git', '-C', dir, 'stash', 'store', '-m', `tessera: before ${commandHead(command)}`, sha], { timeoutMs: 10_000 }).catch(() => undefined)
  $.ui.toast(stored?.exitCode === 0 ? t().stashSaved : t().stashFailed)
}

// Files up to this size are read whole before an edit; a bigger one is left to the edit.
const ENCODING_READ_MAX = 1_048_576
// Files the person said may be rewritten as UTF-8, for the rest of the session.
const acceptedEncodings = new Set<string>()

async function judgeEncoding($: EngineInterface, tool: string, input: Record<string, unknown>) {
  if (!guardEncoding || (tool !== 'Edit' && tool !== 'MultiEdit' && tool !== 'Write' && tool !== 'NotebookEdit')) return undefined
  const file = writtenFile(tool, input)
  if (file === undefined || file.path === '' || acceptedEncodings.has(file.path)) return undefined
  const stat = await $.fs.stat(file.path).catch(() => undefined)
  if (stat === undefined || stat.kind !== 'file' || stat.size === 0 || stat.size > ENCODING_READ_MAX) return undefined
  const read = await $.fs.read(file.path, { as: 'bytes' }).catch(() => undefined)
  if (read === undefined) return undefined
  const encoding = encodingOf(Uint8Array.fromBase64(read.base64))
  if (encoding === 'utf-8') return undefined
  const reminded = await refuseOnce($, file.path, 'file encoding', `it edits ${file.path}, and ${encodingNote(encoding)}. Convert the file to UTF-8 first (iconv, or the editor's "save with encoding"), keeping the original, or ask the person. If rewriting it as UTF-8 is intended`)
  if (reminded === undefined) acceptedEncodings.add(file.path)
  return reminded
}

const EDITS = 'edits'

// The session ids this conversation has had: a /clear ends one and starts another in the same terminal,
// and the cleared one's edits are still this conversation's. register.tsx adds to it at session.end.
export const guards = { ownSessions: new Set<string>() }

// A file another session on this machine edited in the last half hour may still be in its hands. Entries
// past the window are dropped here as well as at each write, so the store holds no stale paths.
async function judgeSessions($: EngineInterface, tool: string, input: Record<string, unknown>) {
  if (!guardSessions) return undefined
  const file = writtenFile(tool, input)
  if (file === undefined || file.path === '') return undefined
  const [stored, sessionId, now] = await Promise.all([$.store.get(EDITS).catch(() => undefined), $.session.id(), $.clock.now()])
  const log = asEditLog(stored)
  const live = prune(log, now)
  if (live !== log) await $.store.set(EDITS, live).catch(() => undefined)
  const other = recentEdit(live, file.path, s => s === sessionId || guards.ownSessions.has(s), now)
  if (other === undefined) return undefined
  return refuseOnce($, file.path, 'other session', `another Claude Code session on this machine edited ${file.path} ${other.ago} and may still be working in it. Read the file again before changing it, keep to the lines your task needs, and if both sessions are meant to work on this file, tell the person. If the edit is still right`)
}

// Every file write that went through is noted for the other sessions, once the tool has run.
async function noteEdit($: EngineInterface, tool: string, input: Record<string, unknown>) {
  const file = guardSessions ? writtenFile(tool, input) : undefined
  if (file === undefined || file.path === '') return
  const [log, sessionId, now] = await Promise.all([$.store.get(EDITS).catch(() => undefined), $.session.id(), $.clock.now()])
  await $.store.set(EDITS, remember(asEditLog(log), file.path, sessionId, now)).catch(() => undefined)
}

async function judgeHans($: EngineInterface, tool: string, input: Record<string, unknown>) {
  if (guardHans === 'off' || (guardHans === 'auto' && session.voice !== 'zh-Hant')) return undefined
  const file = writtenFile(tool, input)
  if (file === undefined || zhTwFixes(file.path, file.texts, '').length === 0) return undefined
  const existing = await $.fs.read(file.path).catch(() => '')
  const found = zhTwFixes(file.path, file.texts, typeof existing === 'string' ? existing : '')
  if (found.length === 0) return undefined
  return refuseOnce($, `${file.path}\n${file.texts.join('\n')}`, 'zh-TW wording', `it writes Simplified characters or zh-CN terms into zh-TW text (${found.slice(0, 8).join(', ')}). Use the zh-TW forms. If the original is intended here, such as a quotation or a zh-CN string`)
}

async function projectGlossary($: EngineInterface): Promise<Term[]> {
  const root = (await $.session.repo())?.root ?? (await $.session.cwd())
  if (glossary?.root !== root) {
    const text = await $.fs.read(`${root}/CLAUDE.md`).catch(() => '')
    glossary = { root, terms: typeof text === 'string' ? parseGlossary(text) : [] }
  }
  return glossary.terms
}

async function judgeGlossary($: EngineInterface, tool: string, input: Record<string, unknown>) {
  if (!guardGlossary) return undefined
  const file = writtenFile(tool, input)
  if (file === undefined) return undefined
  if (/(^|[\\/])CLAUDE\.md$/i.test(file.path)) {
    glossary = undefined
    return undefined
  }
  const terms = await projectGlossary($)
  if (terms.length === 0 || glossaryHits(terms, file.texts, '').length === 0) return undefined
  const existing = await $.fs.read(file.path).catch(() => '')
  const hits = glossaryHits(terms, file.texts, typeof existing === 'string' ? existing : '')
  if (hits.length === 0) return undefined
  return refuseOnce($, `${file.path}\n${file.texts.join('\n')}`, 'project glossary', `it writes wordings the glossary in CLAUDE.md replaces (${hits.slice(0, 8).join(', ')}). Use the glossary's terms. If the other wording is intended here, such as a quotation or a note about the glossary itself`)
}

async function judgeHeredoc($: EngineInterface, command: string) {
  const token = guardHeredoc ? expandedHeredoc(command) : undefined
  if (token === undefined) return undefined
  return refuseOnce($, command, 'unquoted heredoc', `its heredoc delimiter is unquoted, so the shell expands ${token} in the body before anything is written: \${x}, $(cmd) and backticks are replaced and \\\\ becomes \\. Quote the delimiter (<<'EOF') to keep the text as written. If the expansion is intended`)
}

// The model an agent's task calls for, picked by Haiku from the same guidance `choose` gives Claude.
const MODEL_LABELS: Record<string, AgentModel> = {
  'haiku: quick mechanical work such as search, lookups, listing files, renames or formatting': 'haiku',
  'sonnet: routine coding, edits, tests and documentation': 'sonnet',
  'opus: hard reasoning, design, debugging or code review': 'opus',
  'fable: the hardest and longest work, where quality matters more than speed and cost': 'fable',
}

async function pickModel($: EngineInterface, task: string): Promise<AgentModel | undefined> {
  const label = await $.model.classify(task, Object.keys(MODEL_LABELS), { model: 'haiku' }).catch(() => undefined)
  return label === undefined ? undefined : MODEL_LABELS[label]
}

async function judgeWorkflow($: EngineInterface, script: string | undefined, scriptPath: string | undefined) {
  if (agentModel === undefined && !requireUserQuote) return undefined
  const text = script ?? (scriptPath === undefined ? undefined : await $.fs.read(scriptPath).catch(() => undefined))
  if (typeof text !== 'string') return undefined
  // auto cannot fill a script in, so it only reminds: the same script sent again runs as written.
  if (agentModel === 'auto' && !scriptNamesModel(text))
    return refuseOnce($, text, 'Workflow model', `its agent() calls name no model, so every agent runs on the session's model. Give each agent() the model its task needs: ${PICK}. If the session's model is meant for all of them`)
  if (agentModel !== undefined && !scriptNamesModel(text))
    return refuse($, 'Workflow model', agentModel === 'choose'
      ? `its agent() calls name no model, so every agent runs on the session's model. Give each agent() the model its task needs: ${PICK}`
      : `its agent() calls name no model, so every agent runs on the session's model. Add model: '${agentModel}' to each agent()'s options`)
  if (!requireUserQuote) return undefined
  const prompts = (await $.session.messages()).filter(m => m.role === 'user').map(m => m.text)
  if (quotesUser(text, prompts)) return undefined
  return refuse($, 'Workflow authorization', 'the script does not quote the person. Paste their standing instruction verbatim, dated, into the shared prompt, and say that later status questions do not cancel it; agents only see the latest message and refuse to edit otherwise')
}

export function registerGuards(on: On, options: Record<string, unknown>) {
  guardGit = options.guardGit !== false
  agentModel = options.agentModel === undefined || options.agentModel === 'auto' ? 'auto' : options.agentModel === 'choose' ? 'choose' : AGENT_MODELS.find(m => m === options.agentModel)
  requireUserQuote = options.requireUserQuote === true
  guardCjk = options.guardCjkEscapes !== false
  guardHans = options.guardSimplified === 'on' || options.guardSimplified === 'off' ? options.guardSimplified : 'auto'
  guardHeredoc = options.guardHeredoc !== false
  guardGlossary = options.guardGlossary === true
  guardEncoding = options.guardEncoding !== false
  guardData = options.guardData !== false
  guardSessions = options.guardSessions !== false
  stashBeforeDiscard = options.stashBeforeDiscard === true

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) lastAgentCall = await $.clock.now()
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const escape = guardCjk ? misEscapedCjk(tool, input) : undefined
    if (escape !== undefined) {
      const reason = `it writes CJK text as escapes (${escape}). Models mis-spell the hex when they escape, which turns words into wrong characters (anthropics/claude-code#83033). Write the characters themselves`
      // Code can mean an escape (a regex, a test of an escaper); prose and prompts never do.
      const file = writtenFile(tool, input)
      if (file === undefined || isProse(file.path)) return refuse($, 'CJK as \\u escapes', reason)
      const reminded = await refuseOnce($, `${file.path}\n${file.texts.join('\n')}`, 'CJK as \\u escapes', `${reason}. If the escape itself is meant here`)
      if (reminded !== undefined) return reminded
    }
    const encoding = await judgeEncoding($, tool, input)
    if (encoding !== undefined) return encoding
    // PowerShell exists only in the Windows build's tool table, so shells are matched by name here.
    const hans = await judgeHans($, tool, input)
    if (hans !== undefined) return hans
    const terms = await judgeGlossary($, tool, input)
    if (terms !== undefined) return terms
    const sessions = await judgeSessions($, tool, input)
    if (sessions !== undefined) return sessions
    if (tool !== 'Bash' && tool !== 'PowerShell') {
      const result = await next(e)
      if (result.deny === undefined) await noteEdit($, tool, input)
      return result
    }
    const command = String(input.command ?? '')
    return (tool === 'Bash' ? await judgeHeredoc($, command) : undefined) ?? (await judgeShell($, command, e.agentId)) ?? next(e)
  }).catch((_, e, next) => next(e))
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (agentModel === undefined || e.model !== undefined) return next(e)
    if (agentModel === 'choose') return refuse($, 'Agent model', `the call names no model, so the agent runs on the session's model. Pass the model this task needs: ${PICK}`)
    if (agentModel !== 'auto') return next({ ...e, model: agentModel })
    // Other agent types carry their own model in their definition, which an override would replace.
    if (e.subagent_type !== undefined && e.subagent_type !== 'general-purpose') return next(e)
    // The task's description and opening tell its difficulty; a longer prompt only costs Haiku tokens.
    const model = await pickModel($, `Agent type: ${e.subagent_type ?? 'general-purpose'}\nTask: ${e.description}\n\n${e.prompt.slice(0, 2000)}`)
    if (model === undefined) return next(e)
    $.ui.toast(t().agentPicked(e.description, model))
    return next({ ...e, model })
  })
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => (await judgeWorkflow($, e.script, e.scriptPath)) ?? next(e)).catch((_, e, next) => next(e))
}
