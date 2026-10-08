import { expect, test } from 'claude-code/testing'

import { simplifiedChars, simplifiedWrite } from '../hooks/hans'

test('Simplified-only characters are found, characters Traditional text also uses are not', () => {
  expect(simplifiedChars('这个说明为什么没有用')).toEqual(['这', '个', '说', '为', '没'])
  expect(simplifiedChars('台灣皇后住在里長家，干你什麼事')).toEqual([])
})

test('a write names each Simplified character with its Taiwan form', () => {
  expect(simplifiedWrite('C:/p/README.md', ['这里说明'], '')).toEqual(['这→這', '说→說'])
})

test('a file already holding Simplified text, or named for a Simplified locale, is left alone', () => {
  expect(simplifiedWrite('C:/p/notes.md', ['这样'], '已有简体内容')).toEqual([])
  expect(simplifiedWrite('src/locales/zh-CN.json', ['这样'], '')).toEqual([])
  expect(simplifiedWrite('src/i18n/zh_Hans/app.json', ['这样'], '')).toEqual([])
})

test('Japanese lines are not taken for Simplified Chinese', () => {
  expect(simplifiedWrite('docs/STORE.md', ['- ja：一画面が一章、累計スコアで称号が上がります。'], '')).toEqual([])
})
