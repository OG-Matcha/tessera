import { expect, test } from 'claude-code/testing'

import { resumeAt } from '../hooks/limits'

const now = Date.parse('2026-10-08T10:00:00Z')

test('work resumes at the latest reset of the used-up windows', () => {
  const windows = [
    { kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-08T11:30:00Z' },
    { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-12T00:00:00Z' },
  ]
  expect(resumeAt(windows, now)).toBe(Date.parse('2026-10-08T11:30:00Z'))
})

test('with no window marked full, the earliest future reset is used; with none, nothing', () => {
  expect(resumeAt([{ kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-08T12:00:00Z' }, { kind: 'seven_day', percentUsed: 80, resetsAt: '2026-10-10T00:00:00Z' }], now)).toBe(Date.parse('2026-10-08T12:00:00Z'))
  expect(resumeAt([{ kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-08T09:00:00Z' }], now)).toBe(undefined)
  expect(resumeAt([], now)).toBe(undefined)
})
