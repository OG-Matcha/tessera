export type ItemStatus = 'pending' | 'in_progress' | 'completed'

// What one session left to do, kept per repository: the newest sessions only. `tasks` keeps the task
// ids, so a reloaded module can follow later updates.
export type CarryStore = Record<string, { at: number; open: string[]; tasks?: Record<string, { subject: string; status: ItemStatus }> }>

export type TaskLog = {
  tasks: Map<string, { subject: string; status: ItemStatus }>
  todos: { content: string; status: ItemStatus }[]
}

const KEEP = 5
const isOpen = (status: ItemStatus) => status !== 'completed'

export const openItems = (log: TaskLog): string[] => [
  ...[...log.tasks.values()].filter(t => isOpen(t.status)).map(t => t.subject),
  ...log.todos.filter(t => isOpen(t.status)).map(t => t.content),
]

export function recordSession(store: CarryStore, sessionId: string, at: number, log: TaskLog): CarryStore {
  const next = { ...store, [sessionId]: { at, open: openItems(log), tasks: Object.fromEntries(log.tasks) } }
  return Object.fromEntries(Object.entries(next).sort(([, a], [, b]) => b.at - a.at).slice(0, KEEP))
}

// The task list this session kept before the module was reloaded.
export const restoredTasks = (store: CarryStore, sessionId: string): TaskLog['tasks'] => new Map(Object.entries(store[sessionId]?.tasks ?? {}))

// The latest other session in this repository, when it stopped with items still open.
export function carriedFrom(store: CarryStore, sessionId: string): { from: string; items: string[] } | undefined {
  const [from, latest] = Object.entries(store)
    .filter(([id]) => id !== sessionId)
    .sort(([, a], [, b]) => b.at - a.at)[0] ?? []
  return from !== undefined && latest !== undefined && latest.open.length > 0 ? { from, items: latest.open } : undefined
}
