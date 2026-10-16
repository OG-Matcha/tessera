import { expect, test } from 'claude-code/testing'

import { mermaidFit, mermaidText, unpad } from '../hooks/mermaid'
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

const SIX = `graph LR
  A[使用者送出提示] --> B[tessera prompt.submit]
  B --> C{有背景工作?}
  C -->|是| D[清掉安靜列]
  C -->|否| E[照常處理]
  D --> F[模型回覆]
  E --> F`

test('a left-to-right flowchart too wide for the terminal is laid out top down; one that fits stays as written', () => {
  const wideTerminal = unpad(mermaidFit(SIX, false, 160) ?? '')
  const narrowTerminal = unpad(mermaidFit(SIX, false, 100) ?? '')
  expect(wideTerminal).not.toBe('')
  expect(narrowTerminal).not.toBe('')
  expect(wideTerminal.split('\n').length).toBeLessThan(20)
  expect(narrowTerminal.split('\n').length).toBeGreaterThan(wideTerminal.split('\n').length)
  for (const line of narrowTerminal.split('\n')) expect(line.length).toBeLessThanOrEqual(98)
  expect(narrowTerminal).toContain('使用者送出提示')
  // Not a flowchart, and too wide: code it stays.
  expect(mermaidFit('sequenceDiagram\n  參與者甲->>參與者乙: 一段很長很長的訊息文字再長一點\n  參與者乙-->>參與者甲: 回覆', false, 30)).toBe(null)
})
