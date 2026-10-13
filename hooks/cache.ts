// The prompt cache clock: how long the session's prompt cache stays warm after its last response, and
// what the next message re-caches once it has gone cold. Pure; cache-hooks.tsx reads the clock.

import type { CacheWarm } from '../types'

const HOUR = 3_600_000
const FIVE_MINUTES = 300_000

// A subscription's cache lives an hour, an API key's five minutes. The rate-limit windows tell them apart:
// only a subscription reports a five-hour window. (Past a plan's limit, extra usage drops to five
// minutes too, which the windows do not say; the clock then runs long.)
export const ttlMsOf = (rateLimits: readonly { kind: string }[]): number => (rateLimits.some(r => r.kind === 'five_hour') ? HOUR : FIVE_MINUTES)

// Whole minutes until the cache goes cold, 0 once it has.
export const minutesLeft = (warm: CacheWarm): number => Math.max(0, Math.ceil((warm.since + warm.ttlMs - warm.now) / 60_000))

// A token count the row can carry: 85k, 1.2M, 900.
export const shortTokens = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)
