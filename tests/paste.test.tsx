import { expect, test } from 'claude-code/testing'

import { clipboardHolds, placeholders } from '../hooks/paste'
import { clipboardReaders } from '../hooks/platform'

test('placeholders give each paste once, with the extra line count Claude Code states', () => {
  expect(placeholders('a [Pasted text #1 +40 lines] b [Pasted text #3] [Pasted text #1 +40 lines]')).toEqual([
    { n: 1, extraLines: 40 },
    { n: 3, extraLines: undefined },
  ])
})

test('the clipboard counts as the paste only with the stated line count', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => `line ${i}`)
  expect(clipboardHolds(thirty.join('\r\n') + '\r\n', 29)).toBe(true)
  expect(clipboardHolds(thirty.join('\n') + '\n\r\n', 29)).toBe(true)
  expect(clipboardHolds(thirty.join('\n'), 30)).toBe(true)
  expect(clipboardHolds(thirty.join('\n'), 27)).toBe(false)
  expect(clipboardHolds('x'.repeat(1200), undefined)).toBe(true)
  expect(clipboardHolds('a\nb', undefined)).toBe(false)
  expect(clipboardHolds('', 0)).toBe(false)
})

test('the clipboard is read as UTF-8 on Windows and through the usual tools elsewhere', () => {
  expect(clipboardReaders({ OS: 'Windows_NT' })[0]?.join(' ')).toContain('[Console]::OutputEncoding = [Text.Encoding]::UTF8')
  expect(clipboardReaders({ HOME: '/home/a', TERM: 'xterm' }).map(a => a[0])).toEqual(['wl-paste', 'xclip', 'xsel'])
})

// The paste drafts as given, the image list empty and every other state key unset.
const draft = (key: string | undefined, pasted: unknown) => (key === 'draftPastes' ? pasted : key === 'draftImages' ? [] : null)

test('collapsed pasted text shows its first lines and its length above the prompt', { options: { language: 'en' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const pasted = [{ n: 2, total: 40, head: ['Error: boom', '  at main (a.ts:1:1)'] }]
  on('state.get', (_, e) => ({ value: { value: draft((e as { key?: string }).key, pasted), version: 1 } }) as never)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect(await ui.find({ type: 'Text', text: 'Pasted text #2 · 40 lines' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Error: boom' })).toBeDefined()
})

test('another plugin above the prompt still draws under the paste preview', { options: { language: 'en' } }, async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })
  const pasted = [{ n: 1, total: 30, head: ['line one'] }]
  on('state.get', (_, e) => ({ value: { value: draft((e as { key?: string }).key, pasted), version: 1 } }) as never)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect(await ui.find({ type: 'Text', text: 'line one' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
  await ui.unmount()
})
