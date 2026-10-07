import { expect, test } from 'claude-code/testing'

import { STRINGS, pickLang } from '../hooks/i18n'

test('an explicit language wins over every hint', () => {
  expect(pickLang('en', ['zh_TW.UTF-8'])).toBe('en')
  expect(pickLang('zh-TW', [undefined])).toBe('zh-TW')
})

test('auto takes the first real hint, and any Chinese reads Traditional Chinese', () => {
  expect(pickLang('auto', [undefined, '', 'zh_CN.UTF-8'])).toBe('zh-TW')
  expect(pickLang('auto', ['Chinese', 'en_US'])).toBe('zh-TW')
  expect(pickLang('auto', ['C', 'en_US.UTF-8', 'zh-TW'])).toBe('en')
  expect(pickLang('auto', [undefined])).toBe('en')
})

test('both languages carry every string', () => {
  expect(Object.keys(STRINGS['zh-TW']).sort()).toEqual(Object.keys(STRINGS.en).sort())
})
