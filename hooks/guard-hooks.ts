import type { EngineInterface, On } from 'claude-code'

import type { Risk } from './guard'
import type { Discard } from './guard'
import { commandDir, discards, expandedHeredoc, forcePushes, isDefaultBranch, misEscapedCjk, quotesUser, recursiveDeletes, scriptNamesModel, shellRisks, writtenFile } from './guard'
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
let glossary: { root: string; terms: Term[] } | undefined
// The last call refused by a rule that can misjudge intent; the same call sent again goes through.
let refusedOnce = ''
const mainTrees = new Map<string, boolean>()

const RISK_REASONS: Record<Risk, string> = {
  'tree-rewrite': 'it rewrites the shared main working tree while agents are running; other agents and the person lose uncommitted work. Use a separate `git worktree add` (with its own install) or recorded numbers instead',
  'stage-all': "it stages every change while agents are running, which can commit another agent's half-done or reverted files. Stage the files you edited by path",
  'link-node-modules': 'a junction or symlink to node_modules lets a recursive delete (git worktree remove, rm -rf) follow it into the main repo. Run the install inside the worktree instead',
}

export const isAbsolute = (path: string) => /^([a-z]:)?[\\/]/i.test(path)

// A path as the command would see it: absolute as given, else under the command's cd / git -C, else the session's directory.
async function resolveIn($: EngineInterface, command: string, path?: string): Promise<string> {
  const cwd = await $.session.cwd()
  const named = commandDir(command)
  const dir = named === undefined ? cwd : isAbsolute(named) ? named : `${cwd}/${named}`
  return path === undefined ? dir : isAbsolute(path) ? path : `${dir}/${path}`
}

// Whether a path is, or holds, a junction or symlink that a recursive delete would follow; false when unknown.
async function holdsLink($: EngineInterface, path: string): Promise<boolean> {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat === undefined) return false
  if (stat.isLink) return true
  if (stat.kind !== 'dir') return false
  const argv =
    platformOf(session.env) === 'windows'
      ? ['cmd', '/c', 'dir', '/AL', '/S', '/B', path.replace(/\//g, '\\')]
      : ['find', path, '-maxdepth', '8', '-type', 'l', '-print', '-quit']
  const run = await $.process.run(argv, { timeoutMs: 8_000 }).catch(() => undefined)
  return run?.exitCode === 0 && run.stdout.trim() !== ''
}

async function currentBranch($: EngineInterface, command: string): Promise<string | undefined> {
  const run = await $.process.run(['git', '-C', await resolveIn($, command), 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5_000 }).catch(() => undefined)
  return run?.exitCode === 0 ? run.stdout.trim() : undefined
}

async function isMainTree($: EngineInterface, command: string): Promise<boolean> {
  const dir = await resolveIn($, command)
  if (!mainTrees.has(dir)) {
    const run = await $.process.run(['git', '-C', dir, 'rev-parse', '--git-dir', '--git-common-dir'], { timeoutMs: 5_000 }).catch(() => undefined)
    const [gitDir, commonDir] = (run?.stdout ?? '').trim().split(/\r?\n/)
    mainTrees.set(dir, run?.exitCode === 0 && gitDir === commonDir)
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
        ? ['clean', '-n', ...discard.args.map(f => f.replace(/^--force$/, '').replace(/^(-\w*?)f/, '$1')).filter(f => f !== '' && f !== '-')]
        : ['diff', '--name-only', '--', ...discard.args]
  const run = await $.process.run(['git', '-C', dir, ...argv], { timeoutMs: 5_000 }).catch(() => undefined)
  if (run?.exitCode !== 0) return []
  const lines = run.stdout.split(/\r?\n/).filter(l => l.trim() !== '')
  return discard.verb === 'reset' ? lines.map(l => l.slice(3)) : discard.verb === 'clean' ? lines.map(l => l.replace(/^Would remove /, '')) : lines
}

function refuse($: EngineInterface, rule: Rule, reason: string) {
  $.ui.toast(t().blocked(rule))
  return { deny: `tessera blocked this call: ${reason}.` }
}

async function judgeShell($: EngineInterface, command: string, agentId: string | undefined) {
  if (!guardGit) return undefined
  const risks = shellRisks(command)
  if (risks.includes('link-node-modules')) return refuse($, 'node_modules link', RISK_REASONS['link-node-modules'])
  for (const target of recursiveDeletes(command)) {
    if (await holdsLink($, await resolveIn($, command, target)))
      return refuse($, 'delete through a link', `it deletes ${target} recursively and ${target} is or holds a junction or symlink, so the delete can follow it into another tree (git worktree remove and rm -rf both do). List the links (dir /AL /S /B on Windows, find -type l elsewhere), remove each link itself first (rmdir <link> on Windows, rm <link> elsewhere, no recursion), then delete`)
  }
  // Sometimes intended, such as cleaning up a fresh repository, so it is a reminder.
  for (const branch of forcePushes(command)) {
    const target = branch ?? (await currentBranch($, command))
    if (target !== undefined && isDefaultBranch(target))
      return refuseOnce($, command, 'force push', `it force-pushes to ${target}, rewriting history that others and CI build on. Push a branch and merge it instead. If rewriting ${target} is intended`)
  }
  const shared = risks.filter(r => r !== 'link-node-modules')
  const agentsRunning = shared.length > 0 && (agentId !== undefined || (await $.clock.now()) - lastAgentCall < AGENTS_QUIET_MS)
  if (agentsRunning && (await isMainTree($, command))) {
    const risk = shared[0] as Risk
    return refuse($, risk === 'stage-all' ? 'git add -A' : 'git tree rewrite', RISK_REASONS[risk])
  }
  // Discarding is often what the person asked for, so it is a reminder that names what goes.
  for (const discard of discards(command)) {
    const lost = await lostFiles($, command, discard)
    if (lost.length === 0) continue
    const named = `${lost.slice(0, 8).join(', ')}${lost.length > 8 ? ` and ${lost.length - 8} more` : ''}`
    return refuseOnce($, command, 'discard changes', `it throws away uncommitted work that git cannot bring back: ${discard.verb === 'clean' ? 'untracked files' : 'changes to'} ${named}. Commit or \`git stash\` them first, or narrow the command to the files meant. If discarding them is intended`)
  }
  return undefined
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

function judgeHeredoc($: EngineInterface, command: string) {
  const token = guardHeredoc ? expandedHeredoc(command) : undefined
  if (token === undefined) return undefined
  return refuseOnce($, command, 'unquoted heredoc', `its heredoc delimiter is unquoted, so the shell expands ${token} in the body before anything is written: \${x}, $(cmd) and backticks are replaced and \\\\ becomes \\. Quote the delimiter (<<'EOF') to keep the text as written. If the expansion is intended`)
}

function refuseOnce($: EngineInterface, key: string, rule: Rule, reason: string) {
  if (key === refusedOnce) {
    refusedOnce = ''
    return undefined
  }
  refusedOnce = key
  return refuse($, rule, `${reason}, send the same call again unchanged and it goes through`)
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

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) lastAgentCall = await $.clock.now()
    const escape = guardCjk ? misEscapedCjk(String(e.tool), e as unknown as Record<string, unknown>) : undefined
    if (escape !== undefined)
      return refuse($, 'CJK as \\u escapes', `it writes CJK text as escapes (${escape}). Models mis-spell the hex when they escape, which turns words into wrong characters (anthropics/claude-code#83033). Write the characters themselves`)
    // PowerShell exists only in the Windows build's tool table, so shells are matched by name here.
    const tool = String(e.tool)
    const hans = await judgeHans($, tool, e as unknown as Record<string, unknown>)
    if (hans !== undefined) return hans
    const terms = await judgeGlossary($, tool, e as unknown as Record<string, unknown>)
    if (terms !== undefined) return terms
    if (tool !== 'Bash' && tool !== 'PowerShell') return next(e)
    const command = String((e as { command?: unknown }).command ?? '')
    return (tool === 'Bash' ? judgeHeredoc($, command) : undefined) ?? (await judgeShell($, command, e.agentId)) ?? next(e)
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
