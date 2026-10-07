import { expect, test } from 'claude-code/testing'

import { ownWords, voiceOf } from '../hooks/voice'

test('pasted English logs do not outvote a short Chinese request', () => {
  const prompt = ['幫我看一下這個錯誤是怎麼回事', '```', 'TypeError: Cannot read properties of undefined (reading "map")', '    at render (src/App.tsx:12:5)', '```'].join('\n')
  expect(voiceOf(prompt)).toBe('zh-Hant')
})

test('a quoted English brief with a Chinese ask is Chinese; an English ask about Chinese text is English', () => {
  expect(voiceOf('"""\nThe client wants the onboarding flow to support SSO and magic links for all tenants.\n"""\n請照這個需求排工作')).toBe('zh-Hant')
  expect(voiceOf('Please translate this file for me:\n> 這是一段需要翻譯的中文內容，請保留格式')).toBe('en')
})

test('chat logs, links, paths and placeholders are not the person\'s words', () => {
  const own = ownWords('22:55 Amy the booking button does nothing\n[Pasted text #1 +40 lines] https://x.dev/a C:\\repo\\src\\a.ts 這個要修')
  expect(own).not.toContain('booking')
  expect(own).not.toContain('https')
  expect(own).toContain('這個要修')
})

test('simplified, Japanese and Korean are told apart; a bare ok tells nothing', () => {
  expect(voiceOf('这个问题怎么解决，帮我看看')).toBe('zh-Hans')
  expect(voiceOf('このエラーを直してください')).toBe('ja')
  expect(voiceOf('이 오류를 고쳐 주세요')).toBe('ko')
  expect(voiceOf('ok')).toBe(undefined)
  expect(voiceOf('go ahead and run the tests please')).toBe('en')
})
