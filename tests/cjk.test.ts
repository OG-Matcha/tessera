import { expect, test } from 'claude-code/testing'

import { mermaidText, unpad } from '../hooks/mermaid'
import { width } from '../hooks/render'

const lines = (source: string) => unpad(mermaidText(source, false, 100) ?? '').split('\n')

test('a Chinese node label sits inside its box', () => {
  const art = lines('flowchart LR\n    A[跑前守門]')
  expect(art.length).toBeGreaterThan(2)
  expect(new Set(art.map(width)).size).toBe(1)
  expect(art.some(l => l.includes('跑前守門'))).toBe(true)
})

test('rare characters outside the BMP count two columns too', () => {
  const art = lines('flowchart LR\n    A[x𠀀y]')
  expect(new Set(art.map(width)).size).toBe(1)
})

test('copied art carries no layout pads', () => {
  const art = mermaidText('flowchart LR\n    A[中文] --> B[ok]', false, 100) ?? ''
  expect(unpad(art)).not.toContain(String.fromCharCode(0xe000))
  expect(unpad(art)).toContain('中文')
})
