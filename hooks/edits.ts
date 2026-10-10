// The files Claude Code sessions on this machine edited lately, shared through the plugin store, so a
// session can tell when another one is working in the file it is about to change.
export type EditLog = Record<string, { session: string; at: number }>

export const EDIT_WINDOW_MS = 30 * 60_000

// One spelling per file: forward slashes, and on a Windows drive path no case, since the file system has none.
const key = (path: string) => {
  const slashed = path.replace(/\\/g, '/')
  return /^[A-Za-z]:\//.test(slashed) ? slashed.toLowerCase() : slashed
}

export const asEditLog = (value: unknown): EditLog => (value !== null && typeof value === 'object' ? (value as EditLog) : {})

// Another session's edit of the path inside the window, with how long ago it was. `own` says which
// session ids are this conversation's: its current one, and the ones a /clear ended.
export function recentEdit(log: EditLog, path: string, own: (session: string) => boolean, now: number): { session: string; ago: string } | undefined {
  const entry = log[key(path)]
  if (entry === undefined || own(entry.session) || now - entry.at > EDIT_WINDOW_MS) return undefined
  const minutes = Math.round((now - entry.at) / 60_000)
  return { session: entry.session, ago: minutes < 1 ? 'less than a minute ago' : minutes === 1 ? 'a minute ago' : `${minutes} minutes ago` }
}

// The log without the entries outside the window; the same object when there is none to drop.
export function prune(log: EditLog, now: number): EditLog {
  const kept = Object.entries(log).filter(([, e]) => now - e.at <= EDIT_WINDOW_MS)
  return kept.length === Object.keys(log).length ? log : Object.fromEntries(kept)
}

// The log with this edit added and the entries outside the window dropped.
export const remember = (log: EditLog, path: string, session: string, now: number): EditLog => ({ ...prune(log, now), [key(path)]: { session, at: now } })
