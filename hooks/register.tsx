import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Register, RenderElement } from 'claude-code'

import type { DraftImage, ImageView } from '../types'
import type { Rgba } from './png'
import { decodePng, pngSize } from './png'
import { fitCells, thumbnail } from './raster'

import { parse } from './markdown'
import { boxArt, mermaidText, unpad } from './mermaid'
import type { Drawn } from './render'
import { remember, renderBlocks, renderExpandedShell, renderToolGroup, renderToolRow, renderTurnDuration, renderUserPrompt, width } from './render'
import { helpText, rtlShowcaseText, showcaseText } from './help'
import { helpTextZh, showcaseTextZh } from './help-zh'
import type { Risk } from './guard'
import { commandDir, quotesUser, scriptNamesModel, shellRisks } from './guard'
import type { Lang } from './i18n'
import { STRINGS, pickLang } from './i18n'
import { PRESET_NAMES } from './presets'
import type { Style } from './theme'
import { resolveStyle } from './theme'
import type { Terminal } from './rtl'
import { TERMINALS, hasRtl } from './rtl'

const draftImages = atom({ plugin: 'tessera', key: 'draftImages' } as const, [] as DraftImage[])

const POLL_MS = 250
const THUMB_SIZES: Record<string, [number, number]> = { small: [28, 8], medium: [40, 12], large: [64, 20] }

let thumbBox: [number, number] = [40, 12]
let imageMode = 'auto'
let usePixels = false
let lang: Lang = 'en'
const t = () => STRINGS[lang]

let tmpRoot: string | undefined
let imagesDir: { sessionId: string; dir: string } | undefined
let shownKey = ''
let isChecking = false
const pixels = new Map<string, Rgba | null>()

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png; on Windows <tmp> is %TEMP%\claude.
async function root($: EngineInterface): Promise<string> {
  if (tmpRoot !== undefined) return tmpRoot
  const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
  const winTemp = (await isWindows($)) ? await $.env.get('TEMP') : undefined
  tmpRoot =
    fromEnv ??
    (winTemp !== undefined ? `${winTemp.replace(/\\/g, '/')}/claude` : undefined) ??
    `/tmp/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
  return tmpRoot
}

const isWindows = async ($: EngineInterface) => (await $.env.get('OS')) === 'Windows_NT'

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

// Terminals that draw Image as real pixels (kitty graphics with Unicode placeholders); the rest get cell art.
async function detectPixels($: EngineInterface): Promise<boolean> {
  if (imageMode !== 'auto') return imageMode === 'pixels'
  if ((await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')) === '1') return true
  const term = await $.env.get('TERM')
  const program = await $.env.get('TERM_PROGRAM')
  return term === 'xterm-kitty' || term === 'xterm-ghostty' || program === 'ghostty' || (await $.env.get('KITTY_WINDOW_ID')) !== undefined
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
  const argv = (await isWindows($))
    ? ['explorer.exe', path.replace(/\//g, '\\')]
    : [(await $.env.get('XDG_CURRENT_DESKTOP')) === undefined ? 'open' : 'xdg-open', path]
  await $.process.run(argv, { timeoutMs: 5_000 }).catch(() => undefined)
}

function registerImages(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, draftImages)
    if (list.length === 0) return next(e)
    const { Box, Text, Raster, Image, Button } = $.ui.resolve(e)
    return (
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
    )
  })
}

// Guards for long multi-agent runs: a subagent's or workflow agent's tool call carries an agentId.
const AGENTS_QUIET_MS = 180_000
const AGENT_MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const
type AgentModel = (typeof AGENT_MODELS)[number]

let lastAgentCall = -Infinity
let guardGit = true
let agentModel: AgentModel | undefined
let requireUserQuote = false
const mainTrees = new Map<string, boolean>()

const RISK_REASONS: Record<Risk, string> = {
  'tree-rewrite': 'it rewrites the shared main working tree while agents are running; other agents and the person lose uncommitted work. Use a separate `git worktree add` (with its own install) or recorded numbers instead',
  'stage-all': "it stages every change while agents are running, which can commit another agent's half-done or reverted files. Stage the files you edited by path",
  'link-node-modules': 'a junction or symlink to node_modules lets a recursive delete (git worktree remove, rm -rf) follow it into the main repo. Run the install inside the worktree instead',
}

async function isMainTree($: EngineInterface, command: string): Promise<boolean> {
  const cwd = await $.session.cwd()
  const named = commandDir(command)
  const dir = named === undefined ? cwd : /^([a-z]:)?[\\/]/i.test(named) ? named : `${cwd}/${named}`
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
  const shared = risks.filter(r => r !== 'link-node-modules')
  if (shared.length === 0) return undefined
  const agentsRunning = agentId !== undefined || (await $.clock.now()) - lastAgentCall < AGENTS_QUIET_MS
  if (!agentsRunning || !(await isMainTree($, command))) return undefined
  const risk = shared[0] as Risk
  return refuse($, risk === 'stage-all' ? 'git add -A' : 'git tree rewrite', RISK_REASONS[risk])
}

async function judgeWorkflow($: EngineInterface, script: string | undefined, scriptPath: string | undefined) {
  if (agentModel === undefined && !requireUserQuote) return undefined
  const text = script ?? (scriptPath === undefined ? undefined : await $.fs.read(scriptPath).catch(() => undefined))
  if (typeof text !== 'string') return undefined
  if (agentModel !== undefined && !scriptNamesModel(text))
    return refuse($, 'Workflow model', `its agent() calls name no model, so every agent runs on the session's model. Add model: '${agentModel}' to each agent()'s options`)
  if (!requireUserQuote) return undefined
  const prompts = (await $.session.messages()).filter(m => m.role === 'user').map(m => m.text)
  if (quotesUser(text, prompts)) return undefined
  return refuse($, 'Workflow authorization', 'the script does not quote the person. Paste their standing instruction verbatim, dated, into the shared prompt, and say that later status questions do not cancel it; agents only see the latest message and refuse to edit otherwise')
}

function registerGuards(on: On, options: Record<string, unknown>) {
  guardGit = options.guardGit !== false
  agentModel = AGENT_MODELS.find(m => m === options.agentModel)
  requireUserQuote = options.requireUserQuote === true

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) lastAgentCall = await $.clock.now()
    return next(e)
  })
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => (await judgeShell($, e.command, e.agentId)) ?? next(e)).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => (await judgeShell($, e.command, e.agentId)) ?? next(e)).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Agent' }, ($, e, next) => (agentModel !== undefined && e.model === undefined ? next({ ...e, model: agentModel }) : next(e)))
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => (await judgeWorkflow($, e.script, e.scriptPath)) ?? next(e)).catch(($, e, next) => next(e))
}

const HINT = [
  'Replies in this session are drawn by the tessera mod, which runs inside Claude Code and is not a command or tool to call: when the user asks to show something with tessera, write it as markdown in the reply.',
  'Markdown tables, GitHub alerts (> [!WARNING], > [!NOTE]), fenced code with a language tag, and ```mermaid blocks render as colored terminal graphics:',
  'flowcharts, sequence diagrams and xychart-beta bar or line charts.',
  'When a reply carries a numeric series or a flow that is easier to see than read, add one small diagram or chart with short labels.',
  'Skip diagrams for simple answers.',
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

  imageMode = typeof options.imageMode === 'string' ? options.imageMode : 'auto'
  thumbBox = THUMB_SIZES[String(options.thumbnailSize)] ?? thumbBox

  on('session.start', async ($, e, next) => {
    usePixels = await detectPixels($)
    const settings = await $.settings.read({}).catch(() => ({}) as Record<string, unknown>)
    lang = pickLang(options.language, [
      typeof settings.language === 'string' ? settings.language : undefined,
      await $.env.get('LC_ALL'),
      await $.env.get('LANG'),
      Intl.DateTimeFormat().resolvedOptions().locale,
    ])
    $.clock.every(POLL_MS, () => void check($))
    if (!isDrawing) return next(e)
    await applyRtl($, style)
    const started = await next(e)
    await $.command
      .register({ name: 'tessera', description: t().commandDescription, argumentHint: '[theme <name> | copy [code] | demo]' })
      .catch(() => undefined)
    return started
  })

  registerImages(on)
  registerGuards(on, options)
  if (!isDrawing) return
  const parsed = new Map<string, ReturnType<typeof parse>>()
  const parseCached = (text: string, cache = parsed, limit?: number) => remember(cache, text, () => parse(text, { numbers: style.highlightNumbers, paths: style.highlightPaths }), limit)

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

  on('command.run', { command: 'tessera' }, async ($, e) => {
    const [sub, name] = e.args.trim().split(/\s+/)
    if (sub === 'demo') return { text: lang === 'zh-TW' ? showcaseTextZh(PRESET_NAMES) : showcaseText(PRESET_NAMES) }
    if (sub === 'copy') {
      const reply = (await $.session.messages()).findLast(m => m.role === 'assistant' && m.text.trim())
      if (!reply) return { text: t().nothingToCopy }
      const code = name === 'code' ? parseCached(reply.text).findLast(b => b.kind === 'code') : undefined
      if (name === 'code' && code?.kind !== 'code') return { text: t().noCodeBlock }
      const result = await $.ui.copy({ text: code?.kind === 'code' ? code.lines.join('\n') : reply.text })
      return { text: result.isCopied ? (code ? t().copiedCode : t().copiedReply) : `${t().copyFailed}: ${result.reason}` }
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

  on('ui.render', { component: 'TurnDuration' }, ($, e) => renderTurnDuration($.ui.resolve(e), style, e.props.word, e.props.durationMs))

  on('prompt.submit', async ($, e, next) => {
    await applyRtl($, style)
    if (!style.diagramHints || (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge')) return next(e)
    return next({ ...e, context: [...(e.context ?? []), HINT] })
  })

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
