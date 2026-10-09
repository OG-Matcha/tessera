import { expect, test } from 'claude-code/testing'

import { intake, intakeNote, listText, markFixed, parseChat, similarity } from '../hooks/inbox'

const PASTE = ['這是 Amy 傳來的：', '22:55 Amy 首頁的預約按鈕按了沒有反應', '22:57 Amy 表單送出後頁面一片空白', '我晚點再看'].join('\n')

test('a paste with two or more timestamped lines is a chat log', () => {
  expect(parseChat(PASTE)).toEqual([
    { at: '22:55', who: 'Amy', text: '首頁的預約按鈕按了沒有反應' },
    { at: '22:57', who: 'Amy', text: '表單送出後頁面一片空白' },
  ])
  expect(parseChat('[09:01] 王小明：登入後一直轉圈\n14:03:12 Amy: login fails on Safari')).toHaveLength(2)
})

test('one timestamped line or plain prose is not a chat log', () => {
  expect(parseChat('22:55 Amy 首頁壞了')).toEqual([])
  expect(parseChat('會議改到 10:30 開始，記得準時')).toEqual([])
})

test('similar complaints score high, unrelated ones low, in Chinese and English', () => {
  expect(similarity('首頁的預約按鈕按了沒有反應', '預約按鈕按了還是沒有反應')).toBeGreaterThan(0.55)
  expect(similarity('首頁的預約按鈕按了沒有反應', '表單送出後頁面一片空白')).toBeLessThan(0.3)
  expect(similarity('login fails on Safari', 'Safari login still fails')).toBeGreaterThan(0.55)
})

test('a new line like a fixed item is filed as a regression of it', () => {
  const first = intake([], parseChat(PASTE))
  expect(first.added.map(i => i.id)).toEqual([1, 2])
  const fixed = markFixed(first.items, [1], 'abc123')
  const again = intake(fixed, parseChat('10:02 Amy 預約按鈕按了還是沒有反應\n10:03 Amy 價格顯示錯誤'))
  expect(again.added.map(i => i.id)).toEqual([3, 4])
  expect(again.regressions.map(r => [r.item.id, r.like.id])).toEqual([[3, 1]])
  expect(intakeNote(again)).toContain('resembles #1')
  expect(intakeNote(again)).toContain('abc123')
})

test('an exact repeat of an open item is not filed twice', () => {
  const first = intake([], parseChat(PASTE))
  expect(intake(first.items, parseChat(PASTE)).added).toEqual([])
})

test('the list shows status marks', () => {
  const items = markFixed(intake([], parseChat(PASTE)).items, [2], 'def456')
  const text = listText(items, 'empty', ['#', 'Time', 'From', 'Message', 'Status'])
  expect(text).toContain('| # | Time | From | Message | Status |')
  expect(text).toContain('| 2 | 22:57 | Amy |')
  expect(text).toContain('✓ def456')
  expect(listText([], 'empty', [])).toBe('empty')
})
