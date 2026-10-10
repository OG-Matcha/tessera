// A command Claude moved to the background writes its output to a file and reports back only when it
// ends; one that hangs never does, and nobody looks until the person asks. Each is watched through its
// output file: when nothing has been written for a while, the person is told.
export type Watched = { id: string; command: string; path: string; startedAt: number; changedAt: number; size: number; warned: boolean }

export type Quiet = { id: string; command: string; path: string; minutes: number }

// The task a notification delivered to the model reports on.
export const notifiedTask = (text: string): string | undefined => /<task-notification>[\s\S]*?<task-id>([^<]+)<\/task-id>/.exec(text)?.[1]

// One line of the command, for the band, cut between code points.
export const commandHead = (command: string): string => {
  const line = [...(command.split('\n').find(l => l.trim() !== '') ?? '')]
  return line.length > 60 ? `${line.slice(0, 59).join('')}…` : line.join('')
}

// A check of one task against its output file: the file grew, so it is live again (a row that said it
// was quiet comes down, and it can be said again later); or it has been quiet past the limit.
export function checked(task: Watched, size: number | undefined, now: number, quietMs: number): { task: Watched; quiet?: Quiet; resumed?: true } {
  if (size !== undefined && size !== task.size) return { task: { ...task, size, changedAt: now, warned: false }, ...(task.warned ? { resumed: true as const } : {}) }
  if (task.warned || now - task.changedAt < quietMs) return { task }
  return { task: { ...task, warned: true }, quiet: { id: task.id, command: commandHead(task.command), path: task.path, minutes: Math.round((now - task.changedAt) / 60_000) } }
}
