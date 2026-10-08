import { expect, test } from 'claude-code/testing'

import { simplifiedChars, zhTwFixes } from '../hooks/hans'

test('Simplified-only characters are found, characters Traditional text also uses are not', () => {
  expect(simplifiedChars('这个说明为什么没有用')).toEqual(['这', '个', '说', '为', '没'])
  expect(simplifiedChars('舞台上的皇后住在里長家，干你什麼事')).toEqual([])
})

test('a write names each Simplified character with its zh-TW form', () => {
  expect(zhTwFixes('C:/p/README.md', ['这里说明'], '')).toEqual(['这→這', '说→說'])
})

test('a file already holding Simplified text, or named for a Simplified locale, is left alone', () => {
  expect(zhTwFixes('C:/p/notes.md', ['这样'], '已有简体内容')).toEqual([])
  expect(zhTwFixes('src/locales/zh-CN.json', ['这样'], '')).toEqual([])
  expect(zhTwFixes('src/i18n/zh_Hans/app.json', ['这样'], '')).toEqual([])
})

test('Japanese lines are not taken for Simplified Chinese', () => {
  expect(zhTwFixes('docs/STORE.md', ['- ja：一画面が一章、累計スコアで称号が上がります。'], '')).toEqual([])
})

test('zh-CN terms are named with the zh-TW word', () => {
  expect(zhTwFixes('docs/setup.md', ['這台服務器的默認端口是 8080'], '')).toEqual(['服務器→伺服器', '默認→預設', '端口→連接埠'])
})

test('a term the file already uses, and words zh-TW also uses, are left alone', () => {
  expect(zhTwFixes('docs/setup.md', ['把緩存清掉'], '舊的緩存設定')).toEqual([])
  expect(zhTwFixes('docs/setup.md', ['錯誤代碼、文字符號、OAuth 用戶端、持續優化'], '')).toEqual([])
})
