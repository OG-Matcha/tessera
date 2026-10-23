import { expect, test } from 'claude-code/testing'

import type { SeenRow } from '../hooks/prompt-log'
import { PREVIEW_CHARS, addCommand, addPrompt, attachCommandRow, attachPromptRow, attachReply, dropPrompt, fillText, isLogCommand, isTooOld, kindOf, newestFirst, step, unwrapPastes, withRows } from '../hooks/prompt-log'

// What Claude Code 2.1.309 hands prompt.submit for a 3-line paste with words typed after it.
const PASTED = '\n\n<pasted_content id="71cb">\nlog line 1\nlog line 2\nlog line 3\n</pasted_content>\n 這個錯誤是什麼意思'

test('a paste is unwrapped to its text, and the prompt is a paste', () => {
  expect(unwrapPastes(PASTED)).toBe('\n\nlog line 1\nlog line 2\nlog line 3\n 這個錯誤是什麼意思')
  expect(kindOf(PASTED, 'composer', 0)).toBe('paste')
  const [entry] = addPrompt([], PASTED, 'composer', 0, 0)
  expect(entry!.text).toBe('log line 1 log line 2 log line 3 這個錯誤是什麼意思')
  expect(fillText(entry!)).toBe(unwrapPastes(PASTED))
})

test('kinds: typed text, an image alone, Remote Control', () => {
  expect(kindOf('Q11 input log?', 'composer', 0)).toBe('text')
  expect(kindOf('', 'composer', 1)).toBe('image')
  expect(kindOf('看這張圖', 'composer', 1)).toBe('text')
  expect(kindOf('先做三個版本就好', 'bridge', 0)).toBe('remote')
})

test('the preview collapses whitespace and stops at 200 characters without splitting an emoji', () => {
  const long = `${'a'.repeat(PREVIEW_CHARS - 1)}😀😀`
  const [entry] = addPrompt([], `line one\n\n  line two\t${long}`, 'composer', 0, 0)
  expect(entry!.text.startsWith('line one line two a')).toBe(true)
  expect(Array.from(entry!.text)).toHaveLength(PREVIEW_CHARS + 1)
  expect(entry!.text.endsWith('…')).toBe(true)
  expect(entry!.text).not.toContain('�')
})

test('prompts are numbered in order and listed newest first', () => {
  let log = addPrompt([], 'alpha', 'composer', 0, 1)
  log = addCommand(log, 'context', '', 2)
  log = addPrompt(log, 'beta', 'composer', 0, 3)
  expect(log.map(p => p.n)).toEqual([1, 2, 3])
  expect(newestFirst(log).map(p => p.text)).toEqual(['beta', '/context', 'alpha'])
})

test('a command heard twice within five seconds is kept once', () => {
  let log = addCommand([], 'grill-with-docs', 'Q1 a', 1_000)
  log = addCommand(log, 'grill-with-docs', 'Q1 a', 3_000)
  expect(log).toHaveLength(1)
  log = addCommand(log, 'grill-with-docs', 'Q1 a', 9_000)
  expect(log).toHaveLength(2)
  expect(log[0]!.text).toBe('/grill-with-docs Q1 a')
})

test('the row drawn under "placeholder" is never taken; the real row goes to the prompt with its text', () => {
  let log = addPrompt([], 'alpha', 'composer', 0, 1)
  log = addPrompt(log, 'beta', 'composer', 0, 2)
  expect(attachPromptRow(log, 'placeholder', 'beta')).toBe(log)
  log = attachPromptRow(log, 'row-b', 'beta')
  expect(log.find(p => p.n === 2)!.rowId).toBe('row-b')
  expect(log.find(p => p.n === 1)!.rowId).toBe(undefined)
  // Drawn again: nothing changes.
  expect(attachPromptRow(log, 'row-b', 'beta')).toBe(log)
})

test("a row whose text matches no waiting prompt, such as a resumed conversation's, is left alone", () => {
  const log = addPrompt(addPrompt([], 'alpha', 'composer', 0, 1), 'beta', 'composer', 0, 2)
  expect(attachPromptRow(log, 'row-old', 'from before the resume')).toBe(log)
})

test('rows seen while drawing are matched in the order they were drawn, two of the same text included', () => {
  const log = addPrompt(addPrompt(addCommand([], 'context', '', 1), 'ok', 'composer', 0, 2), 'ok', 'composer', 0, 3)
  const seen: SeenRow[] = [
    { id: 'row-1', kind: 'prompt', text: 'ok' },
    { id: 'out-1', kind: 'command', command: 'context', args: '' },
    { id: 'row-2', kind: 'prompt', text: 'ok' },
  ]
  expect(withRows(log, seen).map(p => p.rowId)).toEqual(['out-1', 'row-1', 'row-2'])
})

test('a command row goes only to a command with the same line', () => {
  let log = addPrompt([], 'alpha', 'composer', 0, 1)
  log = addCommand(log, 'context', '', 2)
  expect(attachCommandRow(log, 'out-1', 'usage', '')).toBe(log)
  log = attachCommandRow(log, 'out-1', 'context', '')
  expect(log[1]!.rowId).toBe('out-1')
  expect(log[0]!.rowId).toBe(undefined)
})

test('a reply goes to the newest prompt without one, as its first non-empty line', () => {
  let log = addPrompt([], 'alpha', 'composer', 0, 1)
  log = addPrompt(log, 'beta', 'composer', 0, 2)
  log = attachReply(log, '\n\n  做了四個版本放在同一頁。\n第二行')
  expect(log[1]!.reply).toBe('做了四個版本放在同一頁。')
  expect(log[0]!.reply).toBe(undefined)
  expect(attachReply(log, '   ')).toBe(log)
})

test('a dropped prompt leaves the log', () => {
  const log = addPrompt(addPrompt([], 'alpha', 'composer', 0, 1), 'beta', 'composer', 0, 2)
  expect(dropPrompt(log, 2).map(p => p.text)).toEqual(['alpha'])
})

test('j and k step through the list as drawn, newest first, and stop at its ends', () => {
  const list = newestFirst(addPrompt(addPrompt(addPrompt([], 'a', 'composer', 0, 1), 'b', 'composer', 0, 2), 'c', 'composer', 0, 3))
  expect(step(list, null, 1)).toBe(3)
  expect(step(list, 3, 1)).toBe(2)
  expect(step(list, 1, 1)).toBe(1)
  expect(step(list, 3, -1)).toBe(3)
  expect(step([], null, 1)).toBe(undefined)
})

test('only /tessera log itself is the log command', () => {
  expect(isLogCommand('tessera', 'log')).toBe(true)
  expect(isLogCommand('tessera', ' log ')).toBe(true)
  expect(isLogCommand('tessera', 'setup')).toBe(false)
  expect(isLogCommand('log', '')).toBe(false)
})

test('the log keeps the newest 500', () => {
  let log = addPrompt([], 'p1', 'composer', 0, 1)
  for (let i = 2; i <= 510; i++) log = addPrompt(log, `p${i}`, 'composer', 0, i)
  expect(log).toHaveLength(500)
  expect(log[0]!.n).toBe(11)
  expect(log.at(-1)!.n).toBe(510)
})

test('a scroll refused for a row the screen no longer draws reads as too old; any other refusal does not', () => {
  // Claude Code 2.1.309's words, seen live for a row it never drew.
  expect(isTooOld('nothing drawn under that requestId')).toBe(true)
  expect(isTooOld('not person-initiated')).toBe(false)
})

test('a reply that opens with a code fence is previewed by its first line inside', () => {
  const log = attachReply(addPrompt([], 'numbers', 'composer', 0, 1), '```text\n1\n2\n```')
  expect(log[0]!.reply).toBe('1')
})
