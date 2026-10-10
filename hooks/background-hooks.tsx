import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Quiet } from '../types'
import type { Watched } from './background'
import { checked } from './background'
import { pasteRoot } from './platform'
import { session, t } from './session'

const CHECK_MS = 60_000

const quietTasks = atom({ plugin: 'tessera', key: 'quietTasks' } as const, [] as Quiet[])
const watched = new Map<string, Watched>()
let quietMs = 10 * 60_000
let ticking = false
let tasksDir: { sessionId: string; dir: string } | undefined

// What register.tsx's hooks (the module's one prompt.submit and session.end) clear: a task whose own
// notification arrived, and every task when /clear ends the conversation.
export const background = { watched }

// Claude Code writes a background task's output to <tmp>/<project>/<session>/tasks/<id>.output, beside
// the paste cache; the id is the engine's, so the path never comes from the command's output.
async function findTasksDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (tasksDir?.sessionId === sessionId) return tasksDir.dir
  const root = pasteRoot(session.env)
  const uid = root.includes('{uid}') ? (await $.process.run(['id', '-u']).catch(() => undefined))?.stdout.trim() : undefined
  if (root.includes('{uid}') && !uid) return undefined
  const base = uid === undefined ? root : root.replace('{uid}', uid)
  for (const entry of await $.fs.list(base).catch(() => [])) {
    const dir = `${base}/${entry.name}/${sessionId}/tasks`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      tasksDir = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  for (const [id, task] of [...watched]) {
    const stat = await $.fs.stat(task.path).catch(() => undefined)
    // Forgotten while the stat ran (its notification came, or the person dismissed it): leave it so.
    if (watched.get(id) !== task) continue
    const { task: next, quiet, resumed } = checked(task, stat?.size, now, quietMs)
    watched.set(id, next)
    if (resumed) await update($, quietTasks, list => list.filter(q => q.id !== id))
    if (quiet !== undefined) {
      $.ui.toast(t().quietToast(quiet.command, quiet.minutes))
      await update($, quietTasks, list => [...list.filter(q => q.id !== id), quiet])
    }
  }
}

function forget($: EngineInterface, id: string) {
  watched.delete(id)
  return update($, quietTasks, list => list.filter(q => q.id !== id))
}

async function askClaude($: EngineInterface, quiet: Quiet) {
  await $.prompt.fill({ text: t().quietAsk(quiet.id, quiet.minutes) })
  await forget($, quiet.id)
}

type Backgrounded = { backgroundTaskId?: string; backgroundEndsWithFinalResponse?: true }

// A command the shell tool moved to the background answers with its task id. One a synchronous subagent
// started ends with that subagent's answer and reports nothing, so it is not watched.
async function watch($: EngineInterface, command: string, result: unknown) {
  const record = result !== null && typeof result === 'object' ? (result as Backgrounded) : undefined
  if (record?.backgroundTaskId === undefined || record.backgroundEndsWithFinalResponse === true) return
  const dir = await findTasksDir($)
  if (dir === undefined) return
  const now = await $.clock.now()
  watched.set(record.backgroundTaskId, { id: record.backgroundTaskId, command, path: `${dir}/${record.backgroundTaskId}.output`, startedAt: now, changedAt: now, size: 0, warned: false })
  if (!ticking) {
    ticking = true
    $.clock.every(CHECK_MS, () => tick($))
  }
}

export function registerBackgroundWatch(on: On, options: Record<string, unknown>) {
  const minutes = Number(options.backgroundQuietMinutes)
  quietMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60_000
  watched.clear()
  tasksDir = undefined

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const done = await next(e)
    if (done.deny === undefined && e.run_in_background === true) await watch($, e.command, done.result)
    return done
  })
  // PowerShell exists only in the Windows build's tool table.
  on('tool.call', { tool: 'PowerShell' as 'Bash' }, async ($, e, next) => {
    const done = await next(e)
    if (done.deny === undefined && e.run_in_background === true) await watch($, e.command, done.result)
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, quietTasks)
    if (e.surface !== 'terminal' || e.props.hasSurvey || list.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const below = await next(e)
    const s = t()
    return (
      <Box flexDirection="column">
        {list.map(quiet => (
          <Box key={`quiet-${quiet.id}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Box flexDirection="row" gap={2}>
              <Text bold>{s.quietTitle(quiet.minutes)}</Text>
              <Button key={`quiet-ask-${quiet.id}`} label={s.quietAskButton} onPress={() => askClaude($, quiet)} />
              <Button key={`quiet-ignore-${quiet.id}`} label={s.quietIgnore} onPress={() => forget($, quiet.id)} />
            </Box>
            <Text dimColor wrap="truncate-end">{session.lang === 'zh-TW' ? `${quiet.id}：${quiet.command}` : `${quiet.id}: ${quiet.command}`}</Text>
          </Box>
        ))}
        {below}
      </Box>
    )
  })
}
