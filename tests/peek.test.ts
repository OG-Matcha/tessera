import { expect, test } from 'claude-code/testing'

import { csv, peek } from '../hooks/peek'
import { DOCX, PPTX, XLSX } from './fixtures/office'

const bytes = (base64: string) => Uint8Array.fromBase64(base64)
const utf8 = (text: string) => new TextEncoder().encode(text)

test('a docx reads as its paragraphs, runs joined and entities decoded', () => {
  expect(peek('report.docx', bytes(DOCX))).toBe('季度報告\n\nRevenue grew 12% & costs fell')
})

test('an xlsx lists its sheets and draws the first sheet with shared strings resolved', () => {
  expect(peek('q4.xlsx', bytes(XLSX))).toBe('Sheets: 營收, Notes\n\n| 月份 | 金額 |\n| --- | --- |\n| 一月 | 1200 |')
})

test('a pptx lists slide titles in slide order', () => {
  expect(peek('deck.pptx', bytes(PPTX))).toBe('1. 開場\n2. Roadmap\n10. Thanks')
})

test('csv fields may hold quotes, commas and line breaks', () => {
  expect(csv('name,note\n"Lee, Amy","said ""hi""\nthen left"\n', 10)).toBe('| name | note |\n| --- | --- |\n| Lee, Amy | said "hi" then left |')
})

test('kinds it cannot read are null', () => {
  expect(peek('a.bin', utf8('x'))).toBe(null)
  expect(peek('broken.docx', utf8('not a zip'))).toBe(null)
})

test('/tessera peek draws a document from the session directory', { options: { language: 'en' } }, async ($, on) => {
  on('session.cwd', () => ({ value: '/w' }))
  on('fs.read', (_, e) => ({ value: { base64: String((e as { path?: unknown }).path).endsWith('q4.xlsx') ? XLSX : '' } }) as never)
  const result = await $.command.run({ command: 'tessera', args: 'peek q4.xlsx', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(result.text).toContain('### q4.xlsx')
  expect(result.text).toContain('| 一月 | 1200 |')
})

test('/tessera peek takes an @ file mention as typed with the file typeahead', { options: { language: 'en' } }, async ($, on) => {
  on('session.cwd', () => ({ value: '/w' }))
  on('fs.read', (_, e) => ({ value: { base64: String((e as { path?: unknown }).path).endsWith('q4.xlsx') ? XLSX : '' } }) as never)
  const result = await $.command.run({ command: 'tessera', args: 'peek @q4.xlsx', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(result.text).toContain('### q4.xlsx')
})
