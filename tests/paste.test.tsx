import { expect, test } from 'claude-code/testing'

import { newPastes, pastedNumbers } from '../hooks/paste'

test('the placeholders a paste added are the ones not in the box before it', () => {
  expect(pastedNumbers('a [Pasted text #1 +40 lines] b [Pasted text #3 +2 lines] [Pasted text #1 +40 lines]')).toEqual([1, 3])
  expect(newPastes('fix [Pasted text #1 +40 lines]', 'fix [Pasted text #1 +40 lines] and [Pasted text #2 +8 lines]')).toEqual([2])
  expect(newPastes('', 'no paste here')).toEqual([])
})

test('collapsed pasted text shows its first lines and its length above the prompt', { options: { language: 'en' } }, async ($, on) => {
  const pasted = [{ n: 2, total: 40, head: ['Error: boom', '  at main (a.ts:1:1)'] }]
  on('state.get', (_, e) => ({ value: { value: (e as { key?: string }).key === 'draftPastes' ? pasted : [], version: 1 } }) as never)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect(await ui.find({ type: 'Text', text: 'Pasted text #2 · 40 lines' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Error: boom' })).toBeDefined()
})
