import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { editCounts, foldPatch, patchOf, shellEdits } from '../hooks/fold'

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

test('with a limit of 0 every edit folds to its counts, and a limit caps the lines shown', () => {
  const short = foldPatch([{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }], 0)
  expect(short).toEqual({ shown: [], added: 1, removed: 1, hidden: 2 })
  expect(foldPatch([], 0)).toBe(undefined)
  expect(foldPatch([hunk], 3)?.shown.map(l => l.text)).toEqual(['line 4', 'line 5', 'line 6'])
})

const small = { tool_use_id: 'z1', tool: 'Edit', input: { file_path: '/p/a.txt' }, output: { filePath: '/p/a.txt', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] }, isErrored: false, isRunning: false, isInterrupted: false }

test('with diffLines 0 an edit is one line: its row carries the counts and expand, its result draws nothing', { options: { language: 'en', diffLines: 0 } }, async ($, on) => {
  engine(on)
  const row = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolUse', props: small })
  const result = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: small })
  expect(await row.find({ type: 'Text', text: /^\+1$/ })).toBeDefined()
  expect(await row.find({ type: 'Text', text: /^ -1$/ })).toBeDefined()
  expect(await result.find({ type: 'Text' })).toBeUndefined()
  expect(await result.find({ type: 'Button' })).toBeUndefined()
  const button = await row.find({ type: 'Button' })
  expect(button?.props.label).toBe('expand')
  await row.press({ key: button!.key! })
  expect(await result.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  expect(await row.find({ type: 'Button' })).toBeUndefined()
  await row.unmount()
  await result.unmount()
})

test('with diffLines 0 but tool rows off the result keeps its own counts row', { options: { language: 'en', diffLines: 0, toolRows: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: small })
  expect(await ui.find({ type: 'Text', text: /Added 1 line, removed 1 line/ })).toBeDefined()
  expect((await ui.find({ type: 'Button' }))?.props.label).toBe('expand')
  await ui.unmount()
})

test('editCounts counts a patch, or the lines of a file Write created', () => {
  expect(editCounts({ structuredPatch: [hunk] })).toEqual({ added: 20, removed: 20 })
  expect(editCounts({ type: 'create', filePath: '/p/new.txt', content: 'a\nb\nc\n', structuredPatch: [], originalFile: null })).toEqual({ added: 3, removed: 0 })
  expect(editCounts({ type: 'update', filePath: '/p/big.txt', content: 'x', structuredPatch: [], originalFile: null })).toBeUndefined()
})

const shell = (id: string, files: unknown[]) => ({ tool_use_id: id, tool: 'Bash', output: { stdout: 'changed', stderr: '', interrupted: false, bashEditDiff: { files } }, isErrored: false })
const oneLine = { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }

test('the files a shell command changed fold like edits, under the engine drawing of the output', { options: { language: 'en', diffLines: 0 } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: shell('s1', [{ filePath: '/p/a.txt', hunks: [oneLine] }, { filePath: '/p/new.bin', hunks: [], created: true }]) })
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /a\.txt$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ \+1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ -1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Wrote$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /new\.bin$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\s*1 / })).toBeUndefined()
  const button = await ui.find({ type: 'Button' })
  expect(button?.props.label).toBe('expand')
  await ui.press({ key: button!.key! })
  expect(await ui.find({ type: 'Text', text: /a\.txt$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
})

test('a shell command with a long change shows its gist, a short one stays the engine own', { options: { language: 'en' } }, async ($, on) => {
  engine(on)
  const long = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: shell('s2', [{ filePath: '/p/list.txt', hunks: [hunk] }]) })
  expect(await long.find({ type: 'Text', text: /^ \+20$/ })).toBeDefined()
  expect(await long.find({ type: 'Text', text: /^ -line 5$/ })).toBeDefined()
  expect(await long.find({ type: 'Text', text: /38 more lines/ })).toBeDefined()
  await long.unmount()
  const short = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: shell('s3', [{ filePath: '/p/a.txt', hunks: [oneLine] }]) })
  expect(await short.find({ type: 'Text', text: /a\.txt$/ })).toBeUndefined()
  expect(await short.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await short.unmount()
})

test('shellEdits reads the files a Bash result carries', () => {
  expect(shellEdits({ stdout: '' })).toEqual([])
  expect(shellEdits({ bashEditDiff: { files: [{ filePath: '/p/a', hunks: [oneLine], created: false }, { filePath: '/p/b', hunks: [], created: true }, { nope: 1 }] } })).toEqual([
    { filePath: '/p/a', hunks: [oneLine], created: false, deleted: false },
    { filePath: '/p/b', hunks: [], created: true, deleted: false },
  ])
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

test('a short row under a speaker label is expanded on its own and does not unfold the diffs', async ($, on) => {
  engine(on)
  for (const props of [
    { text: 'done', origin: { kind: 'unclassified' }, isExpanded: true, from: { name: 'bob' } },
    { text: 'task 3 finished', origin: { kind: 'task-notification' }, isExpanded: true, task: { id: '3' } },
  ]) {
    const row = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'UserMessage', props } as never)
    await row.unmount()
    const result = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: edit(`e-${props.text}`) })
    expect(await result.find({ type: 'Button' })).toBeDefined()
    await result.unmount()
  }
})
