import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Register, RenderElement, Timer } from 'claude-code'

import type { CarryOver } from '../types'
import type { Env } from './platform'
import type { InboxItem } from './inbox'
import { intake, intakeNote, listText, markFixed, parseChat } from './inbox'

import { parse } from './markdown'
import { boxArt, mermaidText, unpad } from './mermaid'
import type { CopyKind, Drawn } from './render'
import { breakUnits, remember, renderBlocks, renderExpandedShell, renderFoldedDiff, renderToolGroup, renderToolRow, renderTurnDuration, renderUserPrompt, width } from './render'
import { helpText, rtlShowcaseText, showcaseText } from './help'
import { helpTextZh, showcaseTextZh } from './help-zh'
import type { CarryStore, TaskLog } from './carry'
import { carriedFrom, recordSession, restoredTasks } from './carry'
import { pickLang } from './i18n'
import { session, t } from './session'
import { isAbsolute, registerGuards } from './guard-hooks'
import { registerPastes } from './paste-hooks'
import { completions } from './complete'
import { FEATURES } from './features'
import { foldPatch, patchOf } from './fold'
import { marketplaceWithoutUpdates } from './update'
import { peek } from './peek'
import { resumeAt } from './limits'
import type { Voice } from './voice'
import { replyNote, voiceOf } from './voice'
import { PRESET_NAMES } from './presets'
import type { Style } from './theme'
import { resolveStyle } from './theme'
import type { Terminal } from './rtl'
import { TERMINALS, hasRtl } from './rtl'

const carryOver = atom({ plugin: 'tessera', key: 'carryOver' } as const, null as CarryOver | null)
// The marketplace named in the one-time offer to turn on auto-update, while it shows.
const updateOffer = atom({ plugin: 'tessera', key: 'updateOffer' } as const, null as string | null)
// Edit results the person unfolded.
const unfoldedDiffs = atom({ plugin: 'tessera', key: 'unfoldedDiffs' } as const, [] as string[])
const CARRY_SHOWN = 5
// False while no setting or locale chose Chinese, so a prompt written in Chinese may still switch to it.
let langSettled = false
// Notes stay in the transcript once sent, so each goes once per context: again only after a compaction drops it.
let hintSent = false
let notedVoice: Voice | undefined
let matchReplyLanguage = true
// Renders cannot ask the engine, so tool rows read the session's working directory from here.
let workDir: string | undefined


// Every variable the platform decisions read, each named literally so the engine can list them, read
// at once: each is a round trip to the engine.
async function readEnv($: EngineInterface): Promise<Env> {
  const [OS, TEMP, HOME, CLAUDE_CODE_TMPDIR, CLAUDE_CODE_FORCE_TERMINAL_IMAGES, TERM, TERM_PROGRAM, KITTY_WINDOW_ID, TMUX, STY, WSL_DISTRO_NAME] = await Promise.all([
    $.env.get('OS'),
    $.env.get('TEMP'),
    $.env.get('HOME'),
    $.env.get('CLAUDE_CODE_TMPDIR'),
    $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
    $.env.get('TERM'),
    $.env.get('TERM_PROGRAM'),
    $.env.get('KITTY_WINDOW_ID'),
    $.env.get('TMUX'),
    $.env.get('STY'),
    $.env.get('WSL_DISTRO_NAME'),
  ])
  return { OS, TEMP, HOME, CLAUDE_CODE_TMPDIR, CLAUDE_CODE_FORCE_TERMINAL_IMAGES, TERM, TERM_PROGRAM, KITTY_WINDOW_ID, TMUX, STY, WSL_DISTRO_NAME }
}

// The reply note sits far back in a long context and stops holding; a last reply in another language
// than the person's gets the note sent again.
async function replyDrifted($: EngineInterface, wanted: Voice): Promise<boolean> {
  const messages = await $.session.messages().catch(() => [])
  const last = messages.findLast(m => m.role === 'assistant')
  const spoken = last === undefined ? undefined : voiceOf(last.text)
  return spoken !== undefined && spoken !== wanted
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
  await $.store.set(key, recordSession(await readCarry($, key), await $.session.id(), await $.clock.now(), taskLog)).catch(() => undefined)
}

async function settleCarry($: EngineInterface, from: string, fill: string | undefined) {
  if (fill !== undefined) await $.prompt.fill({ text: fill })
  const key = await carryKey($)
  const { [from]: _, ...rest } = await readCarry($, key)
  await $.store.set(key, rest).catch(() => undefined)
  await update($, carryOver, () => null)
}

async function settleUpdate($: EngineInterface, fill: string | undefined) {
  if (fill !== undefined) await $.prompt.fill({ text: fill })
  await $.store.set('updateOffered', true).catch(() => undefined)
  await update($, updateOffer, () => null)
}

function registerUpdateOffer(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const market = await read($, updateOffer)
    if (e.surface !== 'terminal' || e.props.hasSurvey || market === null) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box flexDirection="row" gap={2}>
            <Text bold>{t().updateTitle}</Text>
            <Button key="update-open" label={t().updateOpen} onPress={() => settleUpdate($, '/plugin')} />
            <Button key="update-later" label={t().updateLater} onPress={() => settleUpdate($, undefined)} />
          </Box>
          <Text dimColor>{t().updateSteps(market)}</Text>
        </Box>
        {below}
      </Box>
    )
  })
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
  // A /clear ends the conversation with no session.start after it: the fresh one starts with an empty
  // task list, and what the cleared one left open is offered like a new session's.
  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear') return next(e)
    taskLog.tasks.clear()
    taskLog.todos = []
    const open = (await readCarry($, await carryKey($)))[e.sessionId]?.open ?? []
    // The session's state is reset once session.end is done, so the offer is written when the fresh
    // conversation's id is in place.
    if (open.length > 0) {
      let tries = 0
      const wait: Timer = $.clock.every(100, async () => {
        if (++tries > 50) return wait.cancel()
        if ((await $.session.id()) === e.sessionId) return
        wait.cancel()
        await update($, carryOver, () => ({ from: e.sessionId, items: open }))
      })
    }
    return next(e)
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

const registerInboxTool = ($: EngineInterface) =>
  $.tool
    .register({
      name: 'inbox_fixed',
      description: "Mark client-feedback inbox items as fixed once a commit fixes them, so a later complaint like them is flagged as a regression. Pass the item numbers from tessera's inbox note and the commit hash.",
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'number' } }, commit: { type: 'string' } }, required: ['ids', 'commit'] },
    })
    .catch(() => undefined)

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
                label={`${isOn ? '☑' : '☐'} ${feature.name[session.lang]}`}
                onPress={() => $.config.set({ key: `${$.plugin.name}.${feature.key}`, value: isOn ? feature.off : feature.on })}
              />
              {/* The pane's width is not known here, so the text wraps by its own pieces, between CJK characters too. */}
              <Box flexDirection="row" flexWrap="wrap" paddingLeft={3}>
                {breakUnits(feature.about[session.lang]).map((unit, i) => <Text key={`a${i}`} dimColor>{unit}</Text>)}
              </Box>
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
// True while the transcript draws every row in full (ctrl+o, --verbose), which tool rows and folded diffs
// leave to the engine. A user message says which view is drawing: every transcript has one, drawn first.
let transcriptExpanded = false

const drawMarkdown = ($: EngineInterface, el: ReturnType<EngineInterface['ui']['resolve']>, style: Style, blocks: ReturnType<typeof parse>, columns: number, reply?: string): RenderElement[] => {
  const { Button } = el
  const copy = (text: string | (() => string), key: string, kind: CopyKind | 'reply' = 'block') =>
    style.copyButtons ? (
      <Button
        key={key}
        variant="primary"
        label={t().copyLabels[kind]}
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
  const button = reply === undefined ? null : copy(reply, 'reply', 'reply')
  return button ? [...elements, <el.Box key="reply" alignSelf="flex-end">{button}</el.Box>] : elements
}

export const register: Register = (on, options) => {
  const isDrawing = options.enabled !== false
  const style = resolveStyle(options)

  session.lang = pickLang(options.language, [])
  langSettled = options.language === 'en' || options.language === 'zh-TW'
  matchReplyLanguage = options.replyLanguage !== 'off'
  session.voice = undefined
  hintSent = false
  notedVoice = undefined

  on('session.start', async ($, e, next) => {
    // Claude 5.x gets no task tools unless asked, and carry-over has nothing to keep without them; a
    // value the person set, on or off, stands.
    // Everything read before the session starts is read at once: each read is a round trip to the engine.
    const [todoTools, readsEnv, settings, wroteLang, lcAll, langVar, setupSeen, sessionCwd] = await Promise.all([
      $.env.get('CLAUDE_CODE_ENABLE_TODO_TOOLS'),
      readEnv($),
      $.settings.read({}).catch(() => ({}) as Record<string, unknown>),
      $.store.get('wroteLang').catch(() => undefined),
      $.env.get('LC_ALL'),
      $.env.get('LANG'),
      $.store.get('setupSeen').catch(() => true),
      $.session.cwd().catch(() => undefined),
    ])
    workDir = sessionCwd
    if (carryOn && todoTools === undefined) await $.env.set('CLAUDE_CODE_ENABLE_TODO_TOOLS', '1').catch(() => undefined)
    session.env = readsEnv
    const hints = [
      typeof settings.language === 'string' ? settings.language : undefined,
      // The language the person wrote in last time, ahead of a system locale that may not be theirs.
      typeof wroteLang === 'string' ? wroteLang : undefined,
      lcAll,
      langVar,
      Intl.DateTimeFormat().resolvedOptions().locale,
    ]
    session.lang = pickLang(options.language, hints)
    langSettled = options.language === 'en' || options.language === 'zh-TW' || session.lang === 'zh-TW'
    const returning = setupSeen === true
    if (!returning) {
      await $.store.set('setupSeen', true).catch(() => undefined)
      $.ui.toast(t().setupHint)
    }
    if (isDrawing) await applyRtl($, style)
    const started = await next(e)
    const carry = async () => {
      const [store, sessionId] = await Promise.all([carryKey($).then(key => readCarry($, key)), $.session.id()])
      // A reload starts the module over within the same session: pick its task list back up.
      if (taskLog.tasks.size === 0) taskLog.tasks = restoredTasks(store, sessionId)
      const offer = e.isInteractive ? carriedFrom(store, sessionId) : undefined
      if (offer !== undefined) await update($, carryOver, () => offer)
    }
    // Asked once, from the second session on, so the first one only shows the setup hint.
    const market = marketplaceWithoutUpdates(settings)
    const offerUpdate = async () => {
      if (e.isInteractive && returning && market !== undefined && (await $.store.get('updateOffered').catch(() => true)) !== true)
        await update($, updateOffer, () => market)
    }
    // What follows the start is independent, so it runs at once too.
    await Promise.all([
      carryOn ? carry() : undefined,
      offerUpdate(),
      $.command
        .register({ name: 'tessera', description: t().commandDescription, argumentHint: '[setup | peek <file> | inbox [fixed <n…>] | theme <name> | copy [code|prompt] | demo]' })
        .catch(() => undefined),
      inboxOn ? registerInboxTool($) : undefined,
    ])
    return started
  })

  const imagesOn = options.pastePreview !== false
  if (imagesOn) registerPastes(on, options)
  if (options.guardGit !== false || options.guardCjkEscapes !== false || options.guardSimplified !== 'off' || options.guardHeredoc !== false || options.guardGlossary === true || options.agentModel !== 'off' || options.requireUserQuote === true)
    registerGuards(on, options)
  registerSetup(on, options)
  if (options.resumeAfterLimit === true) registerResume(on)
  carryOn = options.carryOver !== false
  if (carryOn) registerCarryOver(on)
  registerUpdateOffer(on)
  inboxOn = options.feedbackInbox === true
  const parsed = new Map<string, ReturnType<typeof parse>>()
  const parseCached = (text: string, cache = parsed, limit?: number) => remember(cache, text, () => parse(text, { numbers: style.highlightNumbers, paths: style.highlightPaths }), limit)

  on('tool.call', { tool: 'mcp__tessera__inbox_fixed' }, async ($, e) => {
    const input = e as unknown as { ids?: unknown; commit?: unknown }
    const ids = Array.isArray(input.ids) ? input.ids.filter((n): n is number => typeof n === 'number') : []
    const text = await markInbox($, ids, typeof input.commit === 'string' ? input.commit : '')
    // An MCP tool's result is its text (or a content list), not a whole CallToolResult.
    return { result: text } as never
  })

  on('session.compact', async (_, e, next) => {
    const done = await next(e)
    hintSent = false
    notedVoice = undefined
    return done
  })

  on('prompt.autocomplete', async (_, e, next) => {
    const rows = completions(e.text, e.start, e.token, PRESET_NAMES, session.lang)
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
      session.voice = voiceOf(e.text) ?? session.voice
      if (!langSettled && (session.voice === 'zh-Hant' || session.voice === 'zh-Hans')) {
        session.lang = 'zh-TW'
        langSettled = true
        await $.store.set('wroteLang', 'zh-TW').catch(() => undefined)
      }
      if (matchReplyLanguage && session.voice !== undefined && session.voice !== 'en' && (session.voice !== notedVoice || (await replyDrifted($, session.voice)))) context.push(replyNote(session.voice))
      if (session.voice !== undefined) notedVoice = session.voice
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
      return { text: listText(await readInbox($, await inboxKey($)), t().inboxEmpty, t().inboxHeaders) }
    }
    if (!isDrawing) return { text: t().drawingOff }


    if (sub === 'demo') return { text: session.lang === 'zh-TW' ? showcaseTextZh(PRESET_NAMES) : showcaseText(PRESET_NAMES) }
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
    if (sub !== 'theme' || !name) return { text: session.lang === 'zh-TW' ? helpTextZh(PRESET_NAMES) : helpText(PRESET_NAMES) }
    if (!(PRESET_NAMES as readonly string[]).includes(name)) return { text: t().unknownTheme(name, PRESET_NAMES.join(', ')) }
    const result = await $.config.set({ key: `${$.plugin.name}.theme`, value: name })
    return { text: result.deny ? `${t().themeFailed}: ${result.deny}` : t().themeSet(name) }
  })

  if (options.foldDiffs !== false) {
    on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
      const { tool, tool_use_id: id, output, isErrored } = e.props
      if (transcriptExpanded || isErrored || !/^(Edit|MultiEdit|Write)$/.test(tool) || expandedCalls.has(id)) return next(e)
      const folded = foldPatch(patchOf(output))
      if (folded === undefined || (await read($, unfoldedDiffs)).includes(id)) return next(e)
      const labels = { summary: t().diffSummary(folded.added, folded.removed), hidden: t().diffHidden(folded.hidden), expand: t().diffExpand }
      return renderFoldedDiff($.ui.resolve(e), style, folded, labels, () => update($, unfoldedDiffs, ids => [...ids, id]))
    })
  }

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    // A toggle changes no tool row's props, so the engine would keep their drawings: they are redrawn here.
    if (e.props.isExpanded !== transcriptExpanded) {
      transcriptExpanded = e.props.isExpanded
      $.ui.invalidate('ui.render')
    }
    const kind = e.props.origin.kind
    const own = kind === 'composer' || kind === 'bridge' || (kind === 'unclassified' && !e.props.from && !e.props.task)
    if (!isDrawing || style.promptStyle === 'off' || !own) return next(e)
    return renderUserPrompt($.ui.resolve(e), style, e.props.text, Math.max(20, (e.viewport?.columns ?? 100) - 4))
  })

  if (!isDrawing) return

  if (options.toolRows !== false) {
    on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
      if (e.props.isExpanded) {
        for (const call of e.props.calls) if (call.tool_use_id) expandedCalls.add(call.tool_use_id)
        return next(e)
      }
      return renderToolGroup($.ui.resolve(e), style, e.props.calls, e.props.isActive, e.viewport?.columns, workDir, t().toolWords)
    })
    on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
      if (!transcriptExpanded && !expandedCalls.has(e.props.tool_use_id)) return renderToolRow($.ui.resolve(e), style, e.props, e.viewport?.columns, workDir, t().toolWords)
      return e.props.tool === 'Bash' || e.props.tool === 'PowerShell' ? renderExpandedShell($.ui.resolve(e), style, e.props) : next(e)
    })
  }

  on('ui.render', { component: 'TurnDuration' }, ($, e) => renderTurnDuration($.ui.resolve(e), style, e.props.word, e.props.durationMs))


  on('ui.render', { component: 'CommandOutput' }, ($, e, next) => {
    if (e.props.isErrored) return next(e)
    // An answer to a plugin's own command arrives as "<plugin>: <text>", which breaks a table or heading on
    // its first line; the echoed command above already says whose it is.
    const blocks = parseCached(e.props.command === 'tessera' ? e.props.text.replace(/^tessera: /, '') : e.props.text)
    if (blocks.length === 0) return next(e)
    const el = $.ui.resolve(e)
    const { Box } = el
    const columns = Math.max(20, (e.viewport?.columns ?? 100) - 4)
    return <Box flexDirection="column" rowGap={1} {...(style.reorder && hasRtl(e.props.text) ? { width: '100%' } : {})}>{drawMarkdown($, el, style, blocks, columns)}</Box>
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
