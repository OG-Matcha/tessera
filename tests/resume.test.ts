import { expect, test } from 'claude-code/testing'

const now = Date.parse('2026-10-10T10:00:00Z')
const turn = (reason: string) => ({ reason, turnId: 't1', answer: '', durationMs: 1, isAborted: false }) as never

test('a turn cut short while a window is used up schedules the resume a minute after the reset', { options: { resumeAfterLimit: true } }, async ($, on) => {
  const delays: number[] = []
  const toasts: string[] = []
  on('clock.now', () => ({ value: now }) as never)
  on('clock.after', (_, e) => {
    delays.push((e as { ms: number }).ms)
    return { value: { cancel: () => undefined } } as never
  })
  on('session.usage', () => ({ value: { startedAt: now, rateLimits: [{ kind: 'five_hour', percentUsed: 100, resetsAt: '2026-10-10T11:00:00Z' }] } }) as never)
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  await $.turn.complete(turn('error'))
  expect(delays).toEqual([61 * 60_000])
  expect(toasts[0]).toContain('Usage limit reached')
})

test('an answered turn, or an error with no window used up, schedules nothing', { options: { resumeAfterLimit: true } }, async ($, on) => {
  let scheduled = 0
  on('clock.now', () => ({ value: now }) as never)
  on('clock.after', () => {
    scheduled++
    return { value: { cancel: () => undefined } } as never
  })
  on('session.usage', () => ({ value: { startedAt: now, rateLimits: [] } }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.turn.complete(turn('answer'))
  await $.turn.complete(turn('error'))
  expect(scheduled).toBe(0)
})
