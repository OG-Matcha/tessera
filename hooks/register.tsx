import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Register, RenderElement, Timer } from 'claude-code'

import type { CarryOver, DraftImage, DraftPaste, ImageView } from '../types'
import type { Rgba } from './png'
import { decodePng, pngSize } from './png'
import { fitCells, thumbnail } from './raster'
import type { Env } from './platform'
import { clipboardReaders, drawsPixels, openers, pasteRoot, platformOf } from './platform'
import type { InboxItem } from './inbox'
import { intake, intakeNote, listText, markFixed, parseChat } from './inbox'

import { parse } from './markdown'
import { boxArt, mermaidText, unpad } from './mermaid'
import type { Drawn } from './render'
import { remember, renderBlocks, renderExpandedShell, renderToolGroup, renderToolRow, renderTurnDuration, renderUserPrompt, width } from './render'
import { helpText, rtlShowcaseText, showcaseText } from './help'
import { helpTextZh, showcaseTextZh } from './help-zh'
import type { Risk } from './guard'
import { commandDir, expandedHeredoc, misEscapedCjk, quotesUser, recursiveDeletes, scriptNamesModel, shellRisks, writtenFile } from './guard'
import { zhTwFixes } from './hans'
import type { CarryStore, TaskLog } from './carry'
import { carriedFrom, openItems, recordSession } from './carry'
import type { Term } from './glossary'
import { glossaryHits, parseGlossary } from './glossary'
import type { Lang } from './i18n'
import { STRINGS, pickLang } from './i18n'
import { completions } from './complete'
import { FEATURES } from './features'
import { clipboardHolds, clipboardText, placeholders } from './paste'
import { peek } from './peek'
import { resumeAt } from './limits'
import type { Voice } from './voice'
import { replyNote, voiceOf } from './voice'
import { PRESET_NAMES } from './presets'
import type { Style } from './theme'
import { resolveStyle } from './theme'
import type { Terminal } from './rtl'
import { TERMINALS, hasRtl } from './rtl'

const draftImages = atom({ plugin: 'tessera', key: 'draftImages' } as const, [] as DraftImage[])

const draftPastes = atom({ plugin: 'tessera', key: 'draftPastes' } as const, [] as DraftPaste[])

const carryOver = atom({ plugin: 'tessera', key: 'carryOver' } as const, null as CarryOver | null)
const CARRY_SHOWN = 5
const POLL_MS = 250
const PASTE_HEAD = 4
const pastes = new Map<number, string | null>()
let shownPastes = ''
const THUMB_SIZES: Record<string, [number, number]> = { small: [28, 8], medium: [40, 12], large: [64, 20] }

let thumbBox: [number, number] = [40, 12]
let imageMode = 'auto'
let usePixels = false
let env: Env = {}
let lang: Lang = 'en'
// False while no setting or locale chose Chinese, so a prompt written in Chinese may still switch to it.
let langSettled = false
let voice: Voice | undefined
// Notes stay in the transcript once sent, so each goes once per context: again only after a compaction drops it.
let hintSent = false
let notedVoice: Voice | undefined
let matchReplyLanguage = true
const t = () => STRINGS[lang]

let tmpRoot: string | undefined
let imagesDir: { sessionId: string; dir: string } | undefined
let shownKey = ''
let isChecking = false
const pixels = new Map<string, Rgba | null>()

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png; on Windows <tmp> is %TEMP%\claude.
// Every variable the platform decisions read, each named literally so the engine can list them.
async function readEnv($: EngineInterface): Promise<Env> {
  return {
    OS: await $.env.get('OS'),
    TEMP: await $.env.get('TEMP'),
    HOME: await $.env.get('HOME'),
    CLAUDE_CODE_TMPDIR: await $.env.get('CLAUDE_CODE_TMPDIR'),
    CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
    TERM: await $.env.get('TERM'),
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    TMUX: await $.env.get('TMUX'),
    STY: await $.env.get('STY'),
    WSL_DISTRO_NAME: await $.env.get('WSL_DISTRO_NAME'),
  }
}

async function root($: EngineInterface): Promise<string> {
  if (tmpRoot !== undefined) return tmpRoot
  const base = pasteRoot(env)
  tmpRoot = base.includes('{uid}') ? base.replace('{uid}', (await $.process.run(['id', '-u'])).stdout.trim()) : base
  return tmpRoot
}

async function findImagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (imagesDir?.sessionId === sessionId) return imagesDir.dir
  const base = await root($)
  for (const entry of await $.fs.list(base).catch(() => [])) {
    const dir = `${base}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      imagesDir = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

// Null when the file is no PNG this decoder reads or is over the engine's 4 MiB read cap.
async function pixelsOf($: EngineInterface, path: string): Promise<Rgba | null> {
  if (!pixels.has(path)) {
    const file = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
    pixels.set(path, file === undefined ? null : decodePng(Uint8Array.fromBase64(file.base64)))
  }
  return pixels.get(path) ?? null
}

async function viewOf($: EngineInterface, path: string): Promise<ImageView | null> {
  const [maxColumns, maxRows] = thumbBox
  if (usePixels) {
    const file = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
    const size = file === undefined ? null : pngSize(Uint8Array.fromBase64(file.base64))
    return { kind: 'pixels', ...fitCells(size?.width ?? 16, size?.height ?? 9, maxColumns, maxRows) }
  }
  const img = await pixelsOf($, path)
  return img === null ? null : { kind: 'cells', ...thumbnail(img, maxColumns, maxRows) }
}

async function check($: EngineInterface) {
  if (isChecking) return
  isChecking = true
  try {
    const draft = (await $.prompt.read()).text
    const found = placeholders(draft)
    for (const p of found) if (!pastes.has(p.n)) pastes.set(p.n, await readPaste($, p.extraLines))
    const pasted = found.map(p => p.n).filter(n => typeof pastes.get(n) === 'string')
    if (pasted.join(',') !== shownPastes) {
      shownPastes = pasted.join(',')
      await update($, draftPastes, () =>
        pasted.map(n => {
          const lines = (pastes.get(n) ?? '').split(/\r?\n/)
          return { n, total: lines.length, head: lines.slice(0, PASTE_HEAD) }
        }),
      )
    }
    const numbers = [...new Set([...draft.matchAll(/\[Image #(\d+)\]/g)].map(m => Number(m[1])))]
    const key = numbers.join(',')
    if (key === shownKey) return
    const dir = numbers.length > 0 ? await findImagesDir($) : undefined
    const list: DraftImage[] = []
    if (dir !== undefined) {
      for (const n of numbers) {
        const path = `${dir}/${n}.png`
        if (!(await $.fs.exists(path))) continue
        list.push({ n, path, view: await viewOf($, path) })
      }
    }
    shownKey = list.length === numbers.length ? key : ''
    await update($, draftImages, () => list)
  } finally {
    isChecking = false
  }
}

async function openOriginal($: EngineInterface, path: string) {
  for (const argv of openers(env, path)) {
    const run = await $.process.run(argv, { timeoutMs: 5_000 }).catch(() => undefined)
    if (run?.exitCode === 0) return
  }
}

// The text of a just-collapsed paste, read once from the clipboard; null when the clipboard no longer
// matches it (copied over since, or the paste came from another machine over SSH).
async function readPaste($: EngineInterface, extraLines: number | undefined): Promise<string | null> {
  for (const argv of clipboardReaders(env)) {
    const run = await $.process.run(argv, { timeoutMs: 3_000 }).catch(() => undefined)
    if (run?.exitCode === 0) return clipboardHolds(run.stdout, extraLines) ? clipboardText(run.stdout) : null
  }
  return null
}

function registerPastes(on: On) {

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, draftImages)
    const texts = await read($, draftPastes)
    if (list.length === 0 && texts.length === 0) return next(e)
    const { Box, Text, Raster, Image, Button } = $.ui.resolve(e)
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 4)
    return (
      <Box flexDirection="column">
        {texts.map(paste => (
          <Box key={`paste-${paste.n}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Text dimColor>{t().pastedText(paste.n, paste.total)}</Text>
            {paste.head.map((line, i) => (
              <Text key={`paste-${paste.n}-${i}`} wrap="truncate-end">{[...line].slice(0, width).join('') || ' '}</Text>
            ))}
            {paste.total > paste.head.length && <Text dimColor>…</Text>}
          </Box>
        ))}
      <Box flexDirection="row" gap={2}>
        {list.map(img => (
          <Box key={`img-${img.n}`} flexDirection="column" alignItems="center">
            {img.view === null ? (
              <Text dimColor>{t().noPreview}</Text>
            ) : img.view.kind === 'pixels' ? (
              <Image key={`image-${img.n}`} source={{ file: img.path, format: 'png' }} columns={img.view.columns} rows={img.view.rows} alt={`[Image #${img.n}]`} />
            ) : (
              <Raster key={`raster-${img.n}`} columns={img.view.columns} rows={img.view.rows} cells={img.view.cells} />
            )}
            <Box flexDirection="row" gap={1}>
              <Text dimColor>#{img.n}</Text>
              <Button key={`open-${img.n}`} label={t().original} onPress={() => openOriginal($, img.path)} />
            </Box>
          </Box>
        ))}
      </Box>
      </Box>
    )
  })
}

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
let guardGlossary = true
let glossary: { root: string; terms: Term[] } | undefined
// The last call refused by a rule that can misjudge intent; the same call sent again goes through.
let refusedOnce = ''
const mainTrees = new Map<string, boolean>()

const RISK_REASONS: Record<Risk, string> = {
  'tree-rewrite': 'it rewrites the shared main working tree while agents are running; other agents and the person lose uncommitted work. Use a separate `git worktree add` (with its own install) or recorded numbers instead',
  'stage-all': "it stages every change while agents are running, which can commit another agent's half-done or reverted files. Stage the files you edited by path",
  'link-node-modules': 'a junction or symlink to node_modules lets a recursive delete (git worktree remove, rm -rf) follow it into the main repo. Run the install inside the worktree instead',
}

const isAbsolute = (path: string) => /^([a-z]:)?[\\/]/i.test(path)

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
    platformOf(env) === 'windows'
      ? ['cmd', '/c', 'dir', '/AL', '/S', '/B', path.replace(/\//g, '\\')]
      : ['find', path, '-maxdepth', '8', '-type', 'l', '-print', '-quit']
  const run = await $.process.run(argv, { timeoutMs: 8_000 }).catch(() => undefined)
  return run?.exitCode === 0 && run.stdout.trim() !== ''
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

function refuse($: EngineInterface, rule: string, reason: string) {
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
  const shared = risks.filter(r => r !== 'link-node-modules')
  if (shared.length === 0) return undefined
  const agentsRunning = agentId !== undefined || (await $.clock.now()) - lastAgentCall < AGENTS_QUIET_MS
  if (!agentsRunning || !(await isMainTree($, command))) return undefined
  const risk = shared[0] as Risk
  return refuse($, risk === 'stage-all' ? 'git add -A' : 'git tree rewrite', RISK_REASONS[risk])
}

async function judgeHans($: EngineInterface, tool: string, input: Record<string, unknown>) {
  if (guardHans === 'off' || (guardHans === 'auto' && voice !== 'zh-Hant')) return undefined
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

function refuseOnce($: EngineInterface, key: string, rule: string, reason: string) {
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
  if (agentModel !== undefined && !scriptNamesModel(text))
    return refuse($, 'Workflow model', agentModel === 'choose' || agentModel === 'auto'
      ? `its agent() calls name no model, so every agent runs on the session's model. Give each agent() the model its task needs: ${PICK}`
      : `its agent() calls name no model, so every agent runs on the session's model. Add model: '${agentModel}' to each agent()'s options`)
  if (!requireUserQuote) return undefined
  const prompts = (await $.session.messages()).filter(m => m.role === 'user').map(m => m.text)
  if (quotesUser(text, prompts)) return undefined
  return refuse($, 'Workflow authorization', 'the script does not quote the person. Paste their standing instruction verbatim, dated, into the shared prompt, and say that later status questions do not cancel it; agents only see the latest message and refuse to edit otherwise')
}

function registerGuards(on: On, options: Record<string, unknown>) {
  guardGit = options.guardGit !== false
  agentModel = options.agentModel === 'choose' || options.agentModel === 'auto' ? options.agentModel : AGENT_MODELS.find(m => m === options.agentModel)
  requireUserQuote = options.requireUserQuote === true
  guardCjk = options.guardCjkEscapes !== false
  guardHans = options.guardSimplified === 'on' || options.guardSimplified === 'off' ? options.guardSimplified : 'auto'
  guardHeredoc = options.guardHeredoc !== false
  guardGlossary = options.guardGlossary !== false

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
    const model = await pickModel($, `Agent type: ${e.subagent_type ?? 'general-purpose'}\nTask: ${e.description}\n\n${e.prompt.slice(0, 4000)}`)
    if (model === undefined) return next(e)
    $.ui.toast(t().agentPicked(e.description, model))
    return next({ ...e, model })
  })
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => (await judgeWorkflow($, e.script, e.scriptPath)) ?? next(e)).catch((_, e, next) => next(e))
}

// Carry-over: what this session's task lists leave open is kept per repository, and the next session
// there offers it back above the prompt.
let carryOn = true
const taskLog: TaskLog = { tasks: new Map(), todos: [] }

async function carryKey($: EngineInterface): Promise<string> {
  return `carry:${(await $.session.repo())?.root ?? (await $.session.cwd())}`
}

async function readCarry($: EngineInterface, key: string): Promise<CarryStore> {
  const stored = await $.store.get(key).catch(() => undefined)
  return stored !== null && typeof stored === 'object' ? (stored as CarryStore) : {}
}

async function saveTasks($: EngineInterface) {
  const key = await carryKey($)
  await $.store.set(key, recordSession(await readCarry($, key), await $.session.id(), await $.clock.now(), openItems(taskLog))).catch(() => undefined)
}

async function settleCarry($: EngineInterface, from: string, fill: string | undefined) {
  if (fill !== undefined) await $.prompt.fill({ text: fill })
  const key = await carryKey($)
  const { [from]: _, ...rest } = await readCarry($, key)
  await $.store.set(key, rest).catch(() => undefined)
  await update($, carryOver, () => null)
}

function registerCarryOver(on: On) {
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const out = await next(e)
    const task = (out.result as { task?: { id: string; subject: string } } | undefined)?.task
    if (e.agentId !== undefined || task === undefined) return out
    taskLog.tasks.set(task.id, { subject: task.subject, status: 'pending' })
    await saveTasks($)
    return out
  })
  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const out = await next(e)
    const task = taskLog.tasks.get(e.taskId)
    if (e.agentId !== undefined || task === undefined || out.deny !== undefined) return out
    if (e.status === 'deleted') taskLog.tasks.delete(e.taskId)
    else taskLog.tasks.set(e.taskId, { subject: e.subject ?? task.subject, status: e.status ?? task.status })
    await saveTasks($)
    return out
  })
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined || out.deny !== undefined) return out
    taskLog.todos = e.todos.map(t => ({ content: t.content, status: t.status }))
    await saveTasks($)
    return out
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const offer = await read($, carryOver)
    if (e.surface !== 'terminal' || e.props.hasSurvey || offer === null) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 6)
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" gap={2}>
            <Text bold>{t().carryTitle(offer.items.length)}</Text>
            <Button key="carry-continue" label={t().carryContinue} onPress={() => settleCarry($, offer.from, t().carryPrompt(offer.items))} />
            <Button key="carry-dismiss" label={t().carryDismiss} onPress={() => settleCarry($, offer.from, undefined)} />
          </Box>
          {offer.items.slice(0, CARRY_SHOWN).map((item, i) => (
            <Text key={`carry-${i}`} wrap="truncate-end">{`· ${[...item].slice(0, width).join('')}`}</Text>
          ))}
          {offer.items.length > CARRY_SHOWN && <Text dimColor>…</Text>}
        </Box>
        {below}
      </Box>
    )
  })
}

// The optional client-feedback inbox: pasted chat logs become numbered items per repository, kept across sessions.
let inboxOn = false

async function inboxKey($: EngineInterface): Promise<string> {
  return `inbox:${(await $.session.repo())?.root ?? (await $.session.cwd())}`
}

async function readInbox($: EngineInterface, key: string): Promise<InboxItem[]> {
  const stored = await $.store.get(key).catch(() => undefined)
  return Array.isArray(stored) ? (stored as InboxItem[]) : []
}

async function fileFeedback($: EngineInterface, text: string): Promise<string | undefined> {
  const lines = parseChat(text)
  if (lines.length === 0) return undefined
  const key = await inboxKey($)
  const result = intake(await readInbox($, key), lines)
  if (result.added.length === 0) return undefined
  await $.store.set(key, result.items)
  $.ui.toast(t().inboxFiled(result.added.length, result.regressions.map(r => r.like.id)))
  return intakeNote(result)
}

async function markInbox($: EngineInterface, ids: number[], commit: string): Promise<string> {
  const key = await inboxKey($)
  await $.store.set(key, markFixed(await readInbox($, key), ids, commit))
  return t().inboxMarked(ids, commit)
}

// Resume after a rate limit: one queued "go on" prompt at the reset, cancelled when the person types first.
let pendingResume: Timer | undefined

async function scheduleResume($: EngineInterface) {
  const now = await $.clock.now()
  const at = resumeAt((await $.session.usage()).rateLimits, now)
  if (at === undefined) return
  pendingResume?.cancel()
  pendingResume = $.clock.after(at - now + 60_000, () => {
    pendingResume = undefined
    void $.prompt.submit({ text: t().resumePrompt })
  })
  $.ui.toast(t().resumeScheduled(new Date(at + 60_000).toTimeString().slice(0, 5)))
}

function registerResume(on: On) {
  on('classic.StopFailure', async ($, e, next) => {
    const done = await next(e)
    if (e.error === 'rate_limit') await scheduleResume($)
    return done
  })
}

const SETUP_PANE = 'tessera-setup'

// /tessera setup: one row per feature; a press writes its option, which reloads tessera with it.
function registerSetup(on: On, options: Record<string, unknown>) {
  on('ui.render', { component: 'Pane', requestId: SETUP_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = t()
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>{s.setupTitle}</Text>
          <Button key="close" label={s.closePane} onPress={() => $.ui.close({ id: SETUP_PANE })} />
        </Box>
        {FEATURES.map(feature => {
          const isOn = feature.isOn(options[feature.key])
          return (
            <Box key={feature.key} flexDirection="column" marginTop={1}>
              <Button
                key={`toggle-${feature.key}`}
                label={`${isOn ? '☑' : '☐'} ${feature.name[lang]}`}
                onPress={() => $.config.set({ key: `${$.plugin.name}.${feature.key}`, value: isOn ? feature.off : feature.on })}
              />
              <Text dimColor>{`   ${feature.about[lang]}`}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}

const HINT = [
  'Replies in this session are drawn by the tessera mod, which runs inside Claude Code and is not a command or tool to call: when the user asks to show something with tessera, write it as markdown in the reply.',
  'Markdown tables, GitHub alerts (> [!WARNING], > [!NOTE]), fenced code with a language tag, and ```mermaid blocks render as colored terminal graphics:',
  'flowcharts, sequence diagrams and xychart-beta bar or line charts.',
  'When a reply carries a numeric series or a flow that is easier to see than read, add one small diagram or chart with short labels.',
  'Skip diagrams for simple answers.',
  'When you write a prompt meant for another AI agent or tool, put the whole prompt in one ```prompt fenced block: it draws as a card with a copy button.',
  'Put any command or snippet the user may run or copy in a fenced block with a language tag, never inline code: fenced blocks get a copy button, inline code does not.',
].join(' ')

const detectTerminal = async ($: EngineInterface): Promise<Terminal | null> => {
  const program = await $.env.get('TERM_PROGRAM')
  const term = await $.env.get('TERM')
  if ((await $.env.get('KITTY_WINDOW_ID')) || term === 'xterm-kitty') return 'kitty'
  if (program === 'Apple_Terminal') return 'apple-terminal'
  if (program === 'WarpTerminal') return 'warp'
  if (program === 'ghostty') return 'ghostty'
  if (program === 'WezTerm') return 'wezterm'
  if (program === 'vscode') return 'vscode'
  if (program === 'iTerm.app') return 'iterm'
  if (term === 'alacritty' || (await $.env.get('ALACRITTY_WINDOW_ID'))) return 'alacritty'
  if (await $.env.get('WT_SESSION')) return 'windows-terminal'
  if (await $.env.get('VTE_VERSION')) return 'gnome'
  if (await $.env.get('KONSOLE_VERSION')) return 'konsole'
  return null
}

const applyRtl = async ($: EngineInterface, style: Style): Promise<void> => {
  if (style.rtl !== 'auto') return
  const terminal = await detectTerminal($)
  style.reorder = terminal !== null
  if (terminal) style.shape = TERMINALS[terminal]
}

const expandedCalls = new Set<string>()

const drawMarkdown = ($: EngineInterface, el: ReturnType<EngineInterface['ui']['resolve']>, style: Style, blocks: ReturnType<typeof parse>, columns: number, reply?: string): RenderElement[] => {
  const { Button } = el
  const copy = (text: string | (() => string), key: string, label = '⧉ copy') =>
    style.copyButtons ? (
      <Button
        key={key}
        variant="primary"
        label={label}
        onPress={press => {
          $.ui.copy({ text: typeof text === 'function' ? text() : text, surface: press.surface })
            .then(r => $.ui.toast(r.isCopied ? t().copied : `${t().copyFailed}: ${r.reason}`))
            .catch(() => $.ui.toast(t().copyFailed))
        }}
      />
    ) : null
  const drawn: Drawn = new Map()
  if (style.mermaid) {
    for (const [i, block] of blocks.entries()) {
      if (block.kind !== 'code' || block.lang.toLowerCase() !== 'mermaid') continue
      const art = mermaidText(block.lines.join('\n'), style.mermaidAscii, columns)
      if (art !== null && unpad(art).split('\n').every(l => width(l) <= columns - 2)) drawn.set(i, { element: boxArt(el, style, art, `b${i}`), art: unpad(art) })
    }
  }
  const elements = renderBlocks(el, style, blocks, columns, drawn, copy)
  const button = reply === undefined ? null : copy(reply, 'reply', '⧉ copy reply')
  return button ? [...elements, <el.Box key="reply" alignSelf="flex-end">{button}</el.Box>] : elements
}

export const register: Register = (on, options) => {
  const isDrawing = options.enabled !== false
  const style = resolveStyle(options)

  lang = pickLang(options.language, [])
  langSettled = options.language === 'en' || options.language === 'zh-TW'
  matchReplyLanguage = options.replyLanguage !== 'off'
  voice = undefined
  hintSent = false
  notedVoice = undefined
  imageMode = typeof options.imageMode === 'string' ? options.imageMode : 'auto'
  thumbBox = THUMB_SIZES[String(options.thumbnailSize)] ?? thumbBox

  on('session.start', async ($, e, next) => {
    // Claude 5.x gets no task tools unless asked, and carry-over has nothing to keep without them; a
    // value the person set, on or off, stands.
    if (carryOn && (await $.env.get('CLAUDE_CODE_ENABLE_TODO_TOOLS')) === undefined) await $.env.set('CLAUDE_CODE_ENABLE_TODO_TOOLS', '1').catch(() => undefined)
    env = await readEnv($)
    usePixels = drawsPixels(imageMode, env)
    const settings = await $.settings.read({}).catch(() => ({}) as Record<string, unknown>)
    const hints = [
      typeof settings.language === 'string' ? settings.language : undefined,
      await $.env.get('LC_ALL'),
      await $.env.get('LANG'),
      Intl.DateTimeFormat().resolvedOptions().locale,
    ]
    lang = pickLang(options.language, hints)
    langSettled = options.language === 'en' || options.language === 'zh-TW' || lang === 'zh-TW'
    if (imagesOn) $.clock.every(POLL_MS, () => void check($))
    if ((await $.store.get('setupSeen').catch(() => true)) !== true) {
      await $.store.set('setupSeen', true).catch(() => undefined)
      $.ui.toast(t().setupHint)
    }
    if (isDrawing) await applyRtl($, style)
    const started = await next(e)
    if (carryOn && e.isInteractive) {
      const offer = carriedFrom(await readCarry($, await carryKey($)), await $.session.id())
      if (offer !== undefined) await update($, carryOver, () => offer)
    }
    await $.command
      .register({ name: 'tessera', description: t().commandDescription, argumentHint: '[inbox [fixed <n…>] | theme <name> | copy [code] | demo]' })
      .catch(() => undefined)
    if (inboxOn)
      await $.tool
        .register({
          name: 'inbox_fixed',
          description: "Mark client-feedback inbox items as fixed once a commit fixes them, so a later complaint like them is flagged as a regression. Pass the item numbers from tessera's inbox note and the commit hash.",
          inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'number' } }, commit: { type: 'string' } }, required: ['ids', 'commit'] },
        })
        .catch(() => undefined)
    return started
  })

  const imagesOn = options.pastePreview !== false
  if (imagesOn) registerPastes(on)
  if (options.guardGit !== false || options.guardCjkEscapes !== false || options.guardSimplified !== 'off' || options.guardHeredoc !== false || options.guardGlossary !== false || (options.agentModel !== undefined && options.agentModel !== 'off') || options.requireUserQuote === true)
    registerGuards(on, options)
  registerSetup(on, options)
  if (options.resumeAfterLimit === true) registerResume(on)
  carryOn = options.carryOver !== false
  if (carryOn) registerCarryOver(on)
  inboxOn = options.feedbackInbox === true
  const parsed = new Map<string, ReturnType<typeof parse>>()
  const parseCached = (text: string, cache = parsed, limit?: number) => remember(cache, text, () => parse(text, { numbers: style.highlightNumbers, paths: style.highlightPaths }), limit)

  on('tool.call', { tool: 'mcp__tessera__inbox_fixed' }, async ($, e) => {
    const input = e as unknown as { ids?: unknown; commit?: unknown }
    const ids = Array.isArray(input.ids) ? input.ids.filter((n): n is number => typeof n === 'number') : []
    const text = await markInbox($, ids, typeof input.commit === 'string' ? input.commit : '')
    return { result: { content: [{ type: 'text', text }], isError: false } } as never
  })

  on('session.compact', async (_, e, next) => {
    const done = await next(e)
    hintSent = false
    notedVoice = undefined
    return done
  })

  on('prompt.autocomplete', async (_, e, next) => {
    const rows = completions(e.text, e.start, e.token, PRESET_NAMES, lang)
    if (rows.length === 0) return next(e)
    return { suggestions: [...(await next(e)).suggestions, ...rows] }
  })

  on('prompt.submit', async ($, e, next) => {
    const own = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    const context = [...(e.context ?? [])]
    if (own) {
      if (carryOn && (await read($, carryOver)) !== null) await update($, carryOver, () => null)
      pendingResume?.cancel()
      pendingResume = undefined
      voice = voiceOf(e.text) ?? voice
      if (!langSettled && (voice === 'zh-Hant' || voice === 'zh-Hans')) {
        lang = 'zh-TW'
        langSettled = true
      }
      if (matchReplyLanguage && voice !== undefined && voice !== 'en' && voice !== notedVoice) context.push(replyNote(voice))
      if (voice !== undefined) notedVoice = voice
    }
    if (isDrawing) {
      await applyRtl($, style)
      if (style.diagramHints && own && !hintSent) {
        context.push(HINT)
        hintSent = true
      }
    }
    if (inboxOn && own) {
      const note = await fileFeedback($, e.text)
      if (note !== undefined) context.push(note)
    }
    return context.length === (e.context ?? []).length ? next(e) : next({ ...e, context })
  })

  on('command.run', { command: 'tessera' }, async ($, e) => {
    const [sub, name, ...rest] = e.args.trim().split(/\s+/)
    if (sub === 'peek') {
      const target = [name, ...rest].filter(Boolean).join(' ').replace(/^@/, '').replace(/^["']|["']$/g, '')
      if (target === '') return { text: t().peekUsage }
      const path = isAbsolute(target) ? target : `${await $.session.cwd()}/${target}`
      const file = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
      if (file === undefined) return { text: t().peekUnreadable(target) }
      const summary = peek(path, Uint8Array.fromBase64(file.base64))
      return { text: summary === null ? t().peekUnknown(target) : `### ${target.replace(/^.*[\\/]/, '')}\n\n${summary}` }
    }
    if (sub === 'setup') {
      await $.store.set('setupSeen', true).catch(() => undefined)
      await $.ui.open({ id: SETUP_PANE, title: 'tessera' })
      return { text: t().setupOpened }
    }
    if (sub === 'inbox') {
      if (!inboxOn) return { text: t().inboxOff }
      if (name === 'fixed') {
        const ids = rest.map(Number).filter(n => Number.isInteger(n) && n > 0)
        const head = await $.process.run(['git', '-C', await $.session.cwd(), 'rev-parse', '--short', 'HEAD'], { timeoutMs: 5_000 }).catch(() => undefined)
        return { text: await markInbox($, ids, head?.exitCode === 0 ? head.stdout.trim() : 'manual') }
      }
      return { text: listText(await readInbox($, await inboxKey($)), t().inboxEmpty) }
    }
    if (!isDrawing) return { text: t().drawingOff }


    if (sub === 'demo') return { text: lang === 'zh-TW' ? showcaseTextZh(PRESET_NAMES) : showcaseText(PRESET_NAMES) }
    if (sub === 'copy') {
      const reply = (await $.session.messages()).findLast(m => m.role === 'assistant' && m.text.trim())
      if (!reply) return { text: t().nothingToCopy }
      const wanted = name === 'code' || name === 'prompt' ? name : undefined
      const code = wanted === undefined ? undefined : parseCached(reply.text).findLast(b => b.kind === 'code' && (wanted === 'code' || b.lang === 'prompt'))
      if (wanted !== undefined && code?.kind !== 'code') return { text: wanted === 'prompt' ? t().noPromptBlock : t().noCodeBlock }
      const result = await $.ui.copy({ text: code?.kind === 'code' ? code.lines.join('\n') : reply.text })
      const done = wanted === 'prompt' ? t().copiedPrompt : code ? t().copiedCode : t().copiedReply
      return { text: result.isCopied ? done : `${t().copyFailed}: ${result.reason}` }
    }
    if (sub === 'demo-rtl') {
      await applyRtl($, style)
      return { text: rtlShowcaseText() }
    }
    if (sub !== 'theme' || !name) return { text: lang === 'zh-TW' ? helpTextZh(PRESET_NAMES) : helpText(PRESET_NAMES) }
    if (!(PRESET_NAMES as readonly string[]).includes(name)) return { text: t().unknownTheme(name, PRESET_NAMES.join(', ')) }
    const result = await $.config.set({ key: `${$.plugin.name}.theme`, value: name })
    return { text: result.deny ? `${t().themeFailed}: ${result.deny}` : t().themeSet(name) }
  })

  if (!isDrawing) return

  if (options.toolRows !== false) {
    on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
      if (e.props.isExpanded) {
        for (const call of e.props.calls) if (call.tool_use_id) expandedCalls.add(call.tool_use_id)
        return next(e)
      }
      return renderToolGroup($.ui.resolve(e), style, e.props.calls, e.props.isActive, e.viewport?.columns)
    })
    on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
      if (!expandedCalls.has(e.props.tool_use_id)) return renderToolRow($.ui.resolve(e), style, e.props, e.viewport?.columns)
      return e.props.tool === 'Bash' || e.props.tool === 'PowerShell' ? renderExpandedShell($.ui.resolve(e), style, e.props) : next(e)
    })
  }

  on('ui.render', { component: 'TurnDuration' }, ($, e) => renderTurnDuration($.ui.resolve(e), style, e.props.word, e.props.durationMs))


  on('ui.render', { component: 'CommandOutput' }, ($, e, next) => {
    if (e.props.isErrored) return next(e)
    const blocks = parseCached(e.props.text)
    if (blocks.length === 0) return next(e)
    const el = $.ui.resolve(e)
    const { Box } = el
    const columns = Math.max(20, (e.viewport?.columns ?? 100) - 4)
    return <Box flexDirection="column" rowGap={1} {...(style.reorder && hasRtl(e.props.text) ? { width: '100%' } : {})}>{drawMarkdown($, el, style, blocks, columns)}</Box>
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const kind = e.props.origin.kind
    const own = kind === 'composer' || kind === 'bridge' || (kind === 'unclassified' && !e.props.from && !e.props.task)
    if (style.promptStyle === 'off' || !own) return next(e)
    return renderUserPrompt($.ui.resolve(e), style, e.props.text, Math.max(20, (e.viewport?.columns ?? 100) - 4))
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const blocks = parseCached(e.props.text)
    if (blocks.length === 0) return next(e)
    const el = $.ui.resolve(e)
    const { Box, Text } = el
    const columns = Math.max(20, (e.viewport?.columns ?? 100) - 4)
    const narration = style.toolStyle === 'tree-bold' && blocks.length === 1 && blocks[0]!.kind === 'paragraph'
    return (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text color={style.theme.accent}>{e.props.isFirstOfReply ? '●' : ' '}</Text>
        </Box>
        <Box flexDirection="column" rowGap={1} flexGrow={1}>
          {drawMarkdown($, el, narration ? { ...style, narration } : style, blocks, columns, blocks.length > 1 || hasRtl(e.props.text) ? e.props.text : undefined)}
        </Box>
      </Box>
    )
  })

}
