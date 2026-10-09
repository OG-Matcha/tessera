import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { foldPatch, patchOf } from '../hooks/fold'

const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

// Lines 5 to 24 of a 40-line file rewritten: 20 removed, 20 added, 3 lines of context either side.
const hunk = {
  oldStart: 2,
  oldLines: 26,
  newStart: 2,
  newLines: 26,
  lines: [
    ...[2, 3, 4].map(n => ` line ${n}`),
    ...Array.from({ length: 20 }, (_, i) => `-line ${i + 5}`),
    ...Array.from({ length: 20 }, (_, i) => `+item ${i + 5}`),
    ...[25, 26, 27].map(n => ` line ${n}`),
  ],
}
const edit = (id: string, isErrored = false) => ({ tool_use_id: id, tool: 'Edit', output: { filePath: '/p/list.txt', structuredPatch: [hunk] }, isErrored })

test('a long diff keeps the start of each changed run and the unchanged lines touching it', () => {
  const folded = foldPatch([hunk])
  expect(folded?.added).toBe(20)
  expect(folded?.removed).toBe(20)
  expect(folded?.shown.map(l => `${l.gap ? '⋮' : ''}${l.number}${l.mark}${l.text}`)).toEqual(['4 line 4', '5-line 5', '6-line 6', '7-line 7', '⋮5+item 5', '6+item 6', '7+item 7', '⋮25 line 25'])
  expect(folded?.hidden).toBe(46 - 8)
})

test('a new hunk is marked as a gap even when no diff line between is hidden', () => {
  const lines = (from: number) => [` a${from}`, ...Array.from({ length: 4 }, (_, i) => `+b${from + i}`), ` c${from}`]
  const folded = foldPatch([
    { oldStart: 1, oldLines: 2, newStart: 1, newLines: 6, lines: lines(1) },
    { oldStart: 50, oldLines: 2, newStart: 54, newLines: 6, lines: lines(54) },
    { oldStart: 90, oldLines: 2, newStart: 98, newLines: 6, lines: lines(98) },
  ])
  expect(folded?.shown.filter(l => l.gap).map(l => l.text)).toEqual(['c1', 'a54'])
})

test('a short diff and an output without a patch are left alone', () => {
  expect(foldPatch([{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }])).toBe(undefined)
  expect(patchOf({ type: 'create', content: 'x' })).toEqual([])
  expect(patchOf(undefined)).toEqual([])
})

test('a long Edit result draws folded, and expand gives it back to the engine', { options: { language: 'en' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: edit('e1') })
  expect(await ui.find({ type: 'Text', text: /Added 20 lines, removed 20 lines/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /38 more lines/ })).toBeDefined()
  const button = await ui.find({ type: 'Button' })
  expect(button?.props.label).toBe('expand')
  await ui.press({ key: button!.key! })
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
})

test('with foldDiffs off the engine draws every diff', { options: { foldDiffs: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: edit('e2') })
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
})

test('an errored edit is never folded', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: edit('e3', true) })
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
})

test('the ctrl+o transcript shows every diff whole, and the normal view folds again', async ($, on) => {
  engine(on)
  const message = (isExpanded: boolean) => ({ plugin: 'tessera', surface: 'terminal', component: 'UserMessage', props: { text: 'edit it', origin: { kind: 'composer' }, isExpanded } }) as never
  const verbose = await $.ui.mount(message(true))
  await verbose.unmount()
  const whole = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: edit('e4') })
  expect(await whole.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await whole.unmount()
  const normal = await $.ui.mount(message(false))
  await normal.unmount()
  const folded = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: edit('e5') })
  expect(await folded.find({ type: 'Button' })).toBeDefined()
  await folded.unmount()
})
