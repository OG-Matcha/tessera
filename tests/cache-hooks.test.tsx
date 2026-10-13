import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const MINUTE = 60_000
type On = Parameters<TestBody>[1]

// The engine beneath: a session with nothing in its environment, and the usage the last response reported.
const usage = (on: On, kind = 'five_hour') => {
  on('env.get', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('turn.complete', (_, e) => ({ text: (e as { answer: string }).answer }))
  on('turn.start', (_, e) => ({ turnId: (e as { turnId: string }).turnId }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 85_400, window: 200_000, percent: 43 }, rateLimits: [{ kind, percentUsed: 12 }] } }) as never)
}

const mountBand = ($: Parameters<TestBody>[0], isWorking = false) =>
  $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking, availableRows: 20 }, viewport: { columns: 120, rows: 20 } } as never)

const turn = {
  answer: 'done',
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
  usage: { model: 'claude-haiku-5-5', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80_000, cache_creation_input_tokens: 5_000 },
}

test('the row appears ten minutes before the cache goes cold, counts down, says cold, and leaves with the next turn', { options: { language: 'en', carryOver: false, pastePreview: false, backgroundWatch: false } }, async ($, on) => {
  const clock = mock.clock(on)
  usage(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.turn.complete(turn)
  let ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /Prompt cache/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()
  await clock.advance(50 * MINUTE)
  ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: '⏱ Prompt cache cold in 10 min · the next message re-caches 85k tokens' })).toBeDefined()
  await ui.unmount()
  await clock.advance(10 * MINUTE)
  ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: '⏱ Prompt cache cold · the next message re-caches 85k tokens' })).toBeDefined()
  await ui.unmount()
  // While a turn runs the clock says nothing.
  ui = await mountBand($, true)
  expect(await ui.find({ type: 'Text', text: /Prompt cache/ })).toBeUndefined()
  await ui.unmount()
  await $.turn.start({ text: 'again', turnId: 't2' })
  ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /Prompt cache/ })).toBeUndefined()
  await ui.unmount()
})

test('cacheClockMinutes 60 keeps the row up from the end of the turn, and an API key counts five minutes', { options: { language: 'zh-TW', cacheClockMinutes: 60, carryOver: false, pastePreview: false, backgroundWatch: false } }, async ($, on) => {
  mock.clock(on)
  usage(on, 'spend_limit')
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.turn.complete(turn)
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: '⏱ 快取 5 分後冷掉 · 下一則要重新快取 85k tokens' })).toBeDefined()
  await ui.unmount()
})

test("a subagent's turn and a turn with no request leave the clock alone", { options: { language: 'en', carryOver: false, pastePreview: false, backgroundWatch: false } }, async ($, on) => {
  mock.clock(on)
  usage(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ ...turn, agentId: 'a1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't3', reason: 'aborted' })
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: /Prompt cache/ })).toBeUndefined()
  await ui.unmount()
})
