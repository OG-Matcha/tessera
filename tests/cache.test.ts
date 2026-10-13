import { expect, test } from 'claude-code/testing'

import { minutesLeft, shortTokens, ttlMsOf } from '../hooks/cache'

test('a subscription keeps the cache an hour, an API key five minutes', () => {
  expect(ttlMsOf([{ kind: 'five_hour' }, { kind: 'seven_day' }])).toBe(3_600_000)
  expect(ttlMsOf([{ kind: 'spend_limit' }])).toBe(300_000)
  expect(ttlMsOf([])).toBe(300_000)
})

test('minutes left round up and stop at zero', () => {
  const warm = { since: 0, ttlMs: 3_600_000, tokens: 0 }
  expect(minutesLeft({ ...warm, now: 0 })).toBe(60)
  expect(minutesLeft({ ...warm, now: 3_000_001 })).toBe(10)
  expect(minutesLeft({ ...warm, now: 3_599_000 })).toBe(1)
  expect(minutesLeft({ ...warm, now: 3_600_000 })).toBe(0)
  expect(minutesLeft({ ...warm, now: 9_000_000 })).toBe(0)
})

test('tokens show short', () => {
  expect(shortTokens(900)).toBe('900')
  expect(shortTokens(1400)).toBe('1k')
  expect(shortTokens(85_400)).toBe('85k')
  expect(shortTokens(1_240_000)).toBe('1.2M')
  expect(shortTokens(2_000_000)).toBe('2M')
})
