// The files Claude Code sessions on this machine edited lately, shared through the plugin store, so a
// session can tell when another one is working in the file it is about to change.
export type EditLog = Record<string, { session: string; at: number }>

export const EDIT_WINDOW_MS = 30 * 60_000

const key = (path: string) => path.replace(/\\/g, '/')

export const asEditLog = (value: unknown): EditLog => (value !== null && typeof value === 'object' ? (value as EditLog) : {})

// Another session's edit of the path inside the window, with how long ago it was.
export function recentEdit(log: EditLog, path: string, session: string, now: number): { session: string; ago: string } | undefined {
  const entry = log[key(path)]
  if (entry === undefined || entry.session === session || now - entry.at > EDIT_WINDOW_MS) return undefined
  const minutes = Math.round((now - entry.at) / 60_000)
  return { session: entry.session, ago: minutes < 1 ? 'less than a minute ago' : minutes === 1 ? 'a minute ago' : `${minutes} minutes ago` }
}

// The log with this edit added and the entries outside the window dropped.
export function remember(log: EditLog, path: string, session: string, now: number): EditLog {
  const kept = Object.entries(log).filter(([, e]) => now - e.at <= EDIT_WINDOW_MS)
  return { ...Object.fromEntries(kept), [key(path)]: { session, at: now } }
}
