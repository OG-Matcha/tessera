// The Prompt Log: every prompt the person sent in this session, in order, with the transcript row each
// one drew as, so /tessera log can bring any of them back on screen.

import type { LoggedPrompt } from '../types'

export type PromptKind = LoggedPrompt['kind']

export const PREVIEW_CHARS = 200
export const REPLY_CHARS = 120
// The reply's first line as kept: whole up to here, so masking sees a key before the pane cuts it.
const REPLY_KEPT = 1_000
// A session of a working day stays well under this; past it the oldest go.
const KEPT = 500
// The prompt as sent, kept up to here: the engine cuts a longer one out of the prompt box anyway, so f
// could put no more back, and the whole log is written again on every prompt.
export const SOURCE_CHARS = 10_000

// Pastes reach prompt.submit expanded, each wrapped as <pasted_content id="…">…</pasted_content>; a
// prompt kept to SOURCE_CHARS can end inside one, its closing tag cut away.
const PASTE = /<pasted_content id="[^"]*">\n?([\s\S]*?)(?:\n?<\/pasted_content>|$)/g

export const hasPaste = (text: string) => /<pasted_content id="[^"]*">/.test(text)
export const unwrapPastes = (text: string) => text.replace(PASTE, (_, body: string) => body)

// Cut by code points, so an emoji or a surrogate pair is never split.
export function cut(text: string, max: number): string {
  const points = Array.from(text)
  return points.length > max ? `${points.slice(0, max).join('')}…` : text
}

export const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

// Cut by code points, without a mark: it is what f puts back.
const kept = (text: string) => (text.length <= SOURCE_CHARS ? text : Array.from(text).slice(0, SOURCE_CHARS).join(''))

// The person's own prompts: typed at this terminal, or sent to this session through Remote Control.
export const isOwn = (origin: string) => origin === 'composer' || origin === 'bridge'

// Opening the log is not something to look back for.
export const isLogCommand = (command: string, args: string) => command === 'tessera' && args.trim().split(/\s+/)[0] === 'log'

export function kindOf(text: string, origin: string, images: number): PromptKind {
  if (origin === 'bridge') return 'remote'
  if (images > 0 && flat(unwrapPastes(text)) === '') return 'image'
  return hasPaste(text) ? 'paste' : 'text'
}

const commandLine = (command: string, args: string) => (args.trim() === '' ? `/${command}` : `/${command} ${args.trim()}`)

function append(log: readonly LoggedPrompt[], entry: Omit<LoggedPrompt, 'n'>): LoggedPrompt[] {
  const n = (log.at(-1)?.n ?? 0) + 1
  return [...log, { n, ...entry }].slice(-KEPT)
}

// Before Claude Code 2.1.309 a slash command also came through prompt.submit as its typed line, which
// command.run hears as well: whichever comes second within a few seconds is the same command.
const SAME_COMMAND_MS = 5_000
const sameCommand = (last: LoggedPrompt | undefined, line: string, at: number) => last !== undefined && last.source === line && at - last.at < SAME_COMMAND_MS

export function addPrompt(log: readonly LoggedPrompt[], text: string, origin: string, images: number, at: number): LoggedPrompt[] {
  if (sameCommand(log.at(-1), text.trim(), at) && log.at(-1)!.kind === 'command') return log as LoggedPrompt[]
  return append(log, { at, kind: kindOf(text, origin, images), text: cut(flat(unwrapPastes(text)), PREVIEW_CHARS), source: kept(text) })
}

// A command can be heard twice, at command.run and at prompt.submit: kept once, as a command.
export function addCommand(log: readonly LoggedPrompt[], command: string, args: string, at: number): LoggedPrompt[] {
  const line = commandLine(command, args)
  const last = log.at(-1)
  if (sameCommand(last, line, at)) return last!.kind === 'command' ? (log as LoggedPrompt[]) : log.map(p => (p === last ? { ...p, kind: 'command' as const } : p))
  return append(log, { at, kind: 'command', text: cut(line, PREVIEW_CHARS), source: line })
}

// A prompt the engine dropped never drew a row.
export const dropPrompt = (log: readonly LoggedPrompt[], n: number) => log.filter(p => p.n !== n)

// The engine draws a row under the id "placeholder" while the prompt is being stored, then again under
// its real id; only the real one can be scrolled to.
export const isRealRow = (id: string) => id !== 'placeholder'

// The prompt still waiting for its row with the same text: the row's text is the prompt as sent, pastes
// expanded, and kept as the prompt was. Nothing is guessed: a row of a resumed conversation's own prompt
// is left alone.
function attach(log: readonly LoggedPrompt[], rowId: string, rowText: string, isCommand: boolean): LoggedPrompt[] {
  if (!isRealRow(rowId) || log.some(p => p.rowId === rowId)) return log as LoggedPrompt[]
  const source = kept(rowText)
  const target = log.find(p => p.rowId === undefined && (p.kind === 'command') === isCommand && p.source === source)
  if (target === undefined) return log as LoggedPrompt[]
  return log.map(p => (p === target ? { ...p, rowId } : p))
}

export const attachPromptRow = (log: readonly LoggedPrompt[], rowId: string, rowText: string) => attach(log, rowId, rowText, false)
export const attachCommandRow = (log: readonly LoggedPrompt[], rowId: string, command: string, args: string) => attach(log, rowId, commandLine(command, args), true)

// A transcript row seen while drawing, which cannot write the log: matched to its prompt when read.
export type SeenRow = { id: string; kind: 'prompt'; text: string } | { id: string; kind: 'command'; command: string; args: string }

export const withRows = (log: readonly LoggedPrompt[], rows: Iterable<SeenRow>): LoggedPrompt[] => {
  let out = log as LoggedPrompt[]
  for (const row of rows) out = row.kind === 'prompt' ? attachPromptRow(out, row.id, row.text) : attachCommandRow(out, row.id, row.command, row.args)
  return out
}

// A turn answers the newest prompt that has no reply yet, with its first line of words: a code fence
// says nothing about the reply.
export function attachReply(log: readonly LoggedPrompt[], answer: string): LoggedPrompt[] {
  const line = answer.split('\n').map(flat).find(l => l !== '' && !/^(```|~~~)/.test(l))
  const target = log.findLast(p => p.reply === undefined)
  if (line === undefined || target === undefined) return log as LoggedPrompt[]
  return log.map(p => (p === target ? { ...p, reply: cut(line, REPLY_KEPT) } : p))
}

// What f puts back in the prompt: the prompt as sent, its pastes as plain text.
export const fillText = (prompt: LoggedPrompt) => unwrapPastes(prompt.source)

// Why a jump did not land, as $.ui.scroll put it: a row the screen no longer keeps reads as too old.
export const isTooOld = (deny: string) => /nothing drawn/.test(deny)

export const newestFirst = (log: readonly LoggedPrompt[]) => [...log].reverse()

export function clockText(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// The next or previous prompt in the list as drawn (newest first), from the one selected; with none
// selected, the newest.
export function step(list: readonly LoggedPrompt[], selected: number | null, by: number): number | undefined {
  if (list.length === 0) return undefined
  const at = list.findIndex(p => p.n === selected)
  if (at === -1) return list[0]!.n
  return list[Math.min(list.length - 1, Math.max(0, at + Math.sign(by)))]!.n
}
