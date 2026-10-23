import { atom, read, update } from 'claude-code'
import type { EngineInterface, Hook, MatchedHook, Timer } from 'claude-code'

import type { CacheWarm } from '../types'
import { minutesLeft, shortTokens, ttlMsOf } from './cache'
import { t } from './session'

const TICK_MS = 30_000

const cacheWarm = atom({ plugin: 'tessera', key: 'cacheWarm' } as const, null as CacheWarm | null)
let showMinutes = 10
let timer: Timer | undefined

export function configureCacheClock(options: Record<string, unknown>) {
  const minutes = Number(options.cacheClockMinutes)
  showMinutes = Number.isFinite(minutes) && minutes >= 1 ? Math.min(60, Math.floor(minutes)) : 10
}

// The clock advances by the half minute while a warm reading stands, and stops once it is cold: the
// row then says so until the next turn starts.
function tick($: EngineInterface) {
  timer ??= $.clock.every(TICK_MS, async () => {
    const now = await $.clock.now()
    const warm = await read($, cacheWarm)
    if (warm === null || minutesLeft(warm) === 0) return stop()
    await update($, cacheWarm, w => (w === null ? null : { ...w, now }))
  })
}

function stop() {
  timer?.cancel()
  timer = undefined
}

// The main loop's last response warms the cache from this moment; a turn with no request (an error, an
// interrupt before one) leaves the reading as it was. What the next message re-caches is the window as
// the last response reported it.
export const warmCache: Hook<'turn.complete'> = async ($, e, next) => {
  if (e.agentId !== undefined || e.usage === undefined) return next(e)
  const now = await $.clock.now()
  const usage = await $.session.usage().catch(() => undefined)
  const tokens = usage?.context.tokens ?? e.usage.input_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens + e.usage.output_tokens
  await update($, cacheWarm, () => ({ since: now, ttlMs: ttlMsOf(usage?.rateLimits ?? []), tokens, now }))
  tick($)
  return next(e)
}

// A turn's own requests refresh the cache: while one runs the clock says nothing.
export const forgetCache: Hook<'turn.start'> = async ($, e, next) => {
  stop()
  await update($, cacheWarm, () => null)
  return next(e)
}

export const cacheBand: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  const warm = await read($, cacheWarm)
  if (e.surface !== 'terminal' || e.props.hasSurvey || e.props.isWorking || warm === null) return next(e)
  const left = minutesLeft(warm)
  if (left > showMinutes) return next(e)
  const { Box, Text } = $.ui.resolve(e)
  const below = await next(e)
  const tokens = shortTokens(warm.tokens)
  return (
    <Box flexDirection="column">
      <Text dimColor wrap="truncate-end">{left === 0 ? t().cacheCold(tokens) : t().cacheWarm(left, tokens)}</Text>
      {below}
    </Box>
  )
}
