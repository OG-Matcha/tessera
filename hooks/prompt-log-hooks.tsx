import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook } from 'claude-code'

import type { LoggedPrompt, PromptLogView } from '../types'
import type { SeenRow } from './prompt-log'
import { PREVIEW_CHARS, REPLY_CHARS, addCommand, addPrompt, attachReply, clockText, cut, dropPrompt, fillText, flat, isLogCommand, isOwn, isTooOld, newestFirst, step, unwrapPastes, withRows } from './prompt-log'
import { width } from './render'
import { mask } from './mask'
import { session, t } from './session'
import type { Theme } from './theme'

export const LOG_PANE = 'tessera-log'
// Wide enough for a time, a kind and a line of text; the dock gives at most 45% of the terminal.
export const PANE_COLUMNS = 46
const FLASH_MS = 1_000
const PREVIEW_LINES = 3

const promptLog = atom({ plugin: 'tessera', key: 'promptLog' } as const, [] as LoggedPrompt[])
const promptLogView = atom({ plugin: 'tessera', key: 'promptLogView' } as const, { selected: null } as PromptLogView)
// The transcript row lit for a moment after a jump, read by every transcript row as it draws.
const promptFlash = atom({ plugin: 'tessera', key: 'promptFlash' } as const, null as string | null)

let theme: Theme = {}
// A drawing cannot write state, so what the transcript rows tell while they draw is kept here: each
// row's id and text, matched to its prompt when the log is read, and which rows are on screen now.
// A reload empties both; the matches made before it were written to the log by then. The rows are
// noted by register.tsx's own UserMessage and CommandOutput hooks, which draw them.
export const logScreen = {
  seenRows: new Map<string, SeenRow>(),
  onScreen: new Set<string>(),
  // Whether the pane is up, so a row coming on screen redraws it, and nothing else.
  paneShown: false,
}

export function configurePromptLog(styleTheme: Theme) {
  theme = styleTheme
}

const KIND_ICON: Record<LoggedPrompt['kind'], string> = { text: '·', command: '/', paste: '⎘', image: '▣', remote: '⇄' }

// Up to `columns` cells of `text`, an ellipsis in the last when it is cut.
function fit(text: string, columns: number): string {
  if (width(text) <= columns) return text
  let out = ''
  for (const ch of text) {
    if (width(out + ch) > columns - 1) break
    out += ch
  }
  return `${out}…`
}

// The prompt as the pane names it: an image alone has no text. Masked while /tessera record is on, as all
// tessera draws, and before it is cut, so a cut never leaves part of a key readable.
const shownText = (p: LoggedPrompt) => (p.kind === 'image' && p.text === '' ? t().logImage : session.recording ? cut(mask(flat(unwrapPastes(p.source))), PREVIEW_CHARS) : p.text)
const shownReply = (reply: string) => cut(session.recording ? mask(reply) : reply, REPLY_CHARS)

// The log with every row seen so far matched to its prompt.
async function readLog($: EngineInterface): Promise<LoggedPrompt[]> {
  return withRows(await read($, promptLog), logScreen.seenRows.values())
}

// Writes the matches made while drawing into the log, so they outlive a reload. From an event only.
async function keepRows($: EngineInterface) {
  if (logScreen.seenRows.size > 0) await update($, promptLog, log => withRows(log, logScreen.seenRows.values()))
}

// What Claude Code 2.1.309 adds to the event; before it, a slash command came through as its typed line.
type Later = { isMeta?: true; command?: { name: string; args: string } }

// Registered with a matcher on the person's own origins. A failure of the log's own bookkeeping is the
// log's alone: the prompt goes on as it came.
export const logPrompt: Hook<'prompt.submit'> = async ($, e, next) => {
  const { isMeta, command } = e as typeof e & Later
  if (isMeta === true || !isOwn(e.origin.kind)) return next(e)
  let n: number | undefined
  try {
    const at = await $.clock.now()
    await keepRows($)
    await update($, promptLog, log => {
      const added = command === undefined ? addPrompt(log, e.text, e.origin.kind, e.attachments?.filter(a => a.type === 'image').length ?? 0, at) : isLogCommand(command.name, command.args) ? log : addCommand(log, command.name, command.args, at)
      if (added !== log) n = added.at(-1)?.n
      return added
    })
  } catch {
    n = undefined
  }
  const entered = await next(e)
  if ('drop' in entered && n !== undefined) await update($, promptLog, log => dropPrompt(log, n!)).catch(() => undefined)
  return entered
}

// Slash commands raise no prompt.submit of their own (a skill's may): each is heard here, as it runs.
export const logCommand: Hook<'command.run'> = async ($, e, next) => {
  if (!isOwn(e.origin.kind) || isLogCommand(e.command, e.args)) return next(e)
  try {
    const at = await $.clock.now()
    await keepRows($)
    await update($, promptLog, log => addCommand(log, e.command, e.args, at))
  } catch {
    // The command runs whether or not the log could note it.
  }
  return next(e)
}

// The main loop's answer goes to the prompt it answers. Registered with a matcher on the answered turns.
export const logReply: MatchedHook<'turn.complete', { reason: 'answer' }> = async ($, e, next) => {
  try {
    if (e.agentId === undefined && e.answer.trim() !== '') {
      await keepRows($)
      await update($, promptLog, log => attachReply(log, e.answer))
    }
  } catch {
    // The turn ends whether or not the log could note its answer.
  }
  return next(e)
}

async function select($: EngineInterface, n: number) {
  await update($, promptLogView, () => ({ selected: n }))
}

async function jump($: EngineInterface, n: number) {
  await select($, n)
  await keepRows($)
  const prompt = (await read($, promptLog)).find(p => p.n === n)
  if (prompt === undefined) return
  if (prompt.rowId === undefined) return $.ui.toast(t().logNoRow(n))
  const rowId = prompt.rowId
  // A scroll that throws (no surface to scroll) is told like one the engine refused.
  const moved = await $.ui.scroll({ to: { requestId: rowId }, block: 'start' }).catch((error: unknown) => ({ deny: error instanceof Error ? error.message : String(error) }))
  if (moved.deny !== undefined) return $.ui.toast(isTooOld(moved.deny) ? t().logTooOld(n) : t().logCannotJump(n, moved.deny))
  await update($, promptFlash, () => rowId)
  $.clock.after(FLASH_MS, () => {
    void update($, promptFlash, lit => (lit === rowId ? null : lit))
  })
}

async function putBack($: EngineInterface) {
  const [log, view] = await Promise.all([read($, promptLog), read($, promptLogView)])
  const prompt = log.find(p => p.n === view.selected) ?? log.at(-1)
  if (prompt === undefined) return
  await $.prompt.fill({ text: fillText(prompt) })
  $.ui.toast(t().logFilled(prompt.n))
}

// j and k move the selection from anywhere in the pane, the focus ring with it.
async function move($: EngineInterface, by: number) {
  const [log, view] = await Promise.all([read($, promptLog), read($, promptLogView)])
  const n = step(newestFirst(log), view.selected, by)
  if (n === undefined) return
  await select($, n)
  await $.ui.focus({ requestId: LOG_PANE, key: `log-${n}` }).catch(() => undefined)
}

export const logClosed: MatchedHook<'ui.close', { id: typeof LOG_PANE }> = async (_, e, next) => {
  logScreen.paneShown = false
  return next(e)
}

// The selection follows the focus ring, moved by Tab or a click; the ring moves whether or not it could.
export const logFocus: MatchedHook<'ui.focus', { component: 'Pane'; requestId: typeof LOG_PANE }> = async ($, e, next) => {
  const n = Number(/^log-(\d+)$/.exec(e.element ?? '')?.[1])
  if (Number.isInteger(n)) await select($, n).catch(() => undefined)
  return next(e)
}

// An arrow key, while the list is long enough to scroll, moves the selection by one instead.
export const logArrows: MatchedHook<'ui.scroll', { component: 'Pane'; requestId: typeof LOG_PANE }> = async ($, e, next) => {
  if (e.origin.kind !== 'person' || e.pointer !== undefined || Math.abs(e.by) !== 1) return next(e)
  try {
    await move($, e.by)
    const view = await read($, promptLogView)
    if (view.selected !== null) await $.ui.scroll({ to: { key: `log-${view.selected}` }, in: LOG_PANE, block: 'nearest' })
    return {}
  } catch {
    return next(e)
  }
}

export const logPane: MatchedHook<'ui.render', { component: 'Pane'; requestId: typeof LOG_PANE }> = async ($, e) => {
  logScreen.paneShown = true
  const { Box, Text, Button } = $.ui.resolve(e)
  const [log, view] = await Promise.all([readLog($), read($, promptLogView)])
  const s = t()
  const columns = Math.max(20, e.props.bodyColumns)
  const list = newestFirst(log)
  const selected = list.find(p => p.n === view.selected) ?? list[0]
  const digits = String(list[0]?.n ?? 0).length
  // The selection mark and the on-screen dot, then the number, the time, the kind and the spaces between:
  // what comes before the text on a row.
  const lead = 2 + digits + 1 + 5 + 1 + 1 + 1
  return (
    <Box flexDirection="column">
      <Text bold>{s.logTitle(log.length)}</Text>
      {list.length === 0 && <Text dimColor>{s.logEmpty}</Text>}
      <Box flexDirection="column" marginTop={1}>
        {list.map(p => {
          const shown = p.rowId !== undefined && logScreen.onScreen.has(p.rowId)
          // A Button's label is one string on every Claude Code tessera supports, so the colored marks
          // sit beside it.
          return (
            <Box key={`row-${p.n}`} flexDirection="row">
              <Text color={theme.accent}>{p.n === selected?.n ? '›' : ' '}</Text>
              <Text color={theme.number}>{shown ? '●' : ' '}</Text>
              <Button key={`log-${p.n}`} plain label={`${String(p.n).padStart(digits)} ${clockText(p.at)} ${KIND_ICON[p.kind]} ${fit(shownText(p), columns - lead)}`} onPress={() => jump($, p.n)} />
            </Box>
          )
        })}
      </Box>
      {selected !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{`#${selected.n} · ${clockText(selected.at)} · ${s.logKinds[selected.kind]}`}</Text>
          {/* Cut for wide characters, two cells each, so it never runs past PREVIEW_LINES. */}
          <Text wrap="wrap">{cut(shownText(selected), Math.floor((columns * PREVIEW_LINES) / 2))}</Text>
          {selected.reply !== undefined && <Text dimColor wrap="truncate-end">{`└ ${shownReply(selected.reply)}`}</Text>}
        </Box>
      )}
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Button key="log-up" hotkey="k" plain label={s.logUp} onPress={() => move($, -1)} />
        <Button key="log-down" hotkey="j" plain label={s.logDown} onPress={() => move($, 1)} />
        <Button key="log-fill" hotkey="f" plain label={s.logFill} onPress={() => putBack($)} />
      </Box>
      <Text dimColor wrap="truncate-end">{s.logKeys}</Text>
    </Box>
  )
}
