import { expect, test } from 'claude-code/testing'

import { glossaryHits, parseGlossary } from '../hooks/glossary'

const CLAUDE_MD = `# Project

| 用語 | 避免 | 說明 |
|---|---|---|
| 章 | 關卡、這一關 | 一屏 |
| 畫下句點 | Game Over、遊戲結束 | 結束標題 |
| 全文完 | 通關 | |

| Other | Table |
|---|---|
| a | b |
`

test('a table with use and avoid columns becomes the glossary, other tables do not', () => {
  expect(parseGlossary(CLAUDE_MD)).toEqual([
    { use: '章', avoid: ['關卡', '這一關'] },
    { use: '畫下句點', avoid: ['Game Over', '遊戲結束'] },
    { use: '全文完', avoid: ['通關'] },
  ])
  expect(parseGlossary('| Use | Avoid |\n|---|---|\n| sign in | `log in`, login |')).toEqual([{ use: 'sign in', avoid: ['log in', 'login'] }])
})

test('an avoided wording is named with its term, Latin words only as whole words', () => {
  const terms = parseGlossary(CLAUDE_MD)
  expect(glossaryHits(terms, ['title: "GAME OVER"，下一關卡'], '')).toEqual(['關卡→章', 'Game Over→畫下句點'])
  expect(glossaryHits(parseGlossary('| Use | Avoid |\n|---|---|\n| sign in | login |'), ['loginForm and blogin'], '')).toEqual([])
})

test('a wording the file already uses passes', () => {
  expect(glossaryHits(parseGlossary(CLAUDE_MD), ['通關之後'], '舊文案：通關')).toEqual([])
})
