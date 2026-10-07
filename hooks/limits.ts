export type RateWindow = { kind: string; percentUsed: number; resetsAt?: string }

// When work can go on after a rate limit: the latest reset among the windows that are used up,
// or, when the usage figures name none, the earliest reset of any window.
export function resumeAt(windows: readonly RateWindow[], now: number): number | undefined {
  const resets = (list: readonly RateWindow[]) => list.map(w => Date.parse(w.resetsAt ?? '')).filter(t => Number.isFinite(t) && t > now)
  const full = resets(windows.filter(w => w.percentUsed >= 99))
  if (full.length > 0) return Math.max(...full)
  const any = resets(windows)
  return any.length > 0 ? Math.min(...any) : undefined
}
