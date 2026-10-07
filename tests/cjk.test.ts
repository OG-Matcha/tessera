import { expect, test } from 'claude-code/testing'

import { mermaidText, unpad } from '../hooks/mermaid'
import { width } from '../hooks/render'
import { showcaseTextZh } from '../hooks/help-zh'

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

test('every diagram in the Chinese demo draws as art', () => {
  const sources = [...showcaseTextZh(['nord', 'github-light', 'mono']).matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m => m[1] ?? '')
  expect(sources.length).toBe(2)
  for (const source of sources) expect(mermaidText(source, false, 100)).not.toBe(null)
})

test('Chinese chart categories sit under their ticks', () => {
  const art = lines('xychart-beta\n    x-axis [第1天, 第2天, 第3天, 第4天, 第5天]\n    bar [100, 136, 123, 183, 167]')
  const axis = art.findLastIndex(l => l.includes('┬'))
  const ticks = [...art[axis]!].flatMap((ch, x) => (ch === '┬' ? [x] : []))
  const row = art[axis + 1]!
  const centers = [...row.matchAll(/第\d天/g)].map(m => width(row.slice(0, m.index)) + width(m[0]) / 2)
  expect(centers.length).toBe(ticks.length)
  centers.forEach((c, i) => expect(Math.abs(c - ticks[i]!)).toBeLessThanOrEqual(1.5))
})
