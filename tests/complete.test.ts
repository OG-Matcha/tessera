import { expect, test } from 'claude-code/testing'

import { completions } from '../hooks/complete'

const THEMES = ['nord', 'github-dark', 'github-light', 'mono']
const at = (text: string, lang: 'en' | 'zh-TW' = 'zh-TW') => {
  const start = text.lastIndexOf(' ') + 1
  return completions(text, start, text.slice(start), THEMES, lang)
}

test('subcommands after /tessera, with a description in the person\'s language', () => {
  expect(at('/tessera i')).toEqual([{ text: 'inbox', description: '客戶回饋收件匣；inbox fixed <編號…> 標為已修' }])
  expect(at('/tessera c', 'en').map(s => s.text)).toEqual(['copy'])
  expect(at('/tessera d').map(s => s.text)).toEqual(['demo'])
})

test('theme names after /tessera theme, second words after copy and inbox', () => {
  expect(at('/tessera theme g').map(s => s.text)).toEqual(['github-dark', 'github-light'])
  expect(at('/tessera copy c').map(s => s.text)).toEqual(['code'])
  expect(at('/tessera inbox f').map(s => s.text)).toEqual(['fixed'])
})

test('other commands and later words get nothing', () => {
  expect(at('/help i')).toEqual([])
  expect(at('/tessera inbox fixed 3')).toEqual([])
  expect(at('please tessera i')).toEqual([])
})
