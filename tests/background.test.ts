import { expect, test } from 'claude-code/testing'

import { checked, commandHead, notifiedTask } from '../hooks/background'

test('a notification names the task it reports on', () => {
  expect(notifiedTask('<task-notification>\n<task-id>b9xpokvj4</task-id>\n<status>completed</status>\n</task-notification>')).toBe('b9xpokvj4')
  expect(notifiedTask('please continue')).toBe(undefined)
})

test('a task is quiet once its output file stops growing for the limit; growth takes the row down and lets it be said again', () => {
  const minute = 60_000
  const task = { id: 'a', command: 'npm run build\necho done', path: '/t/a.output', startedAt: 0, changedAt: 0, size: 0, warned: false }
  const grown = checked(task, 120, 5 * minute, 10 * minute)
  expect(grown.quiet).toBe(undefined)
  expect(grown.resumed).toBe(undefined)
  expect(grown.task).toMatchObject({ size: 120, changedAt: 5 * minute })
  expect(checked(grown.task, 120, 14 * minute, 10 * minute).quiet).toBe(undefined)
  const quiet = checked(grown.task, 120, 16 * minute, 10 * minute)
  expect(quiet.quiet).toEqual({ id: 'a', command: 'npm run build', path: '/t/a.output', minutes: 11 })
  expect(checked(quiet.task, 120, 30 * minute, 10 * minute).quiet).toBe(undefined)
  const resumed = checked(quiet.task, 500, 31 * minute, 10 * minute)
  expect(resumed.resumed).toBe(true)
  expect(resumed.task.warned).toBe(false)
  expect(checked(resumed.task, 500, 42 * minute, 10 * minute).quiet?.minutes).toBe(11)
  expect(checked(task, undefined, 11 * minute, 10 * minute).quiet?.minutes).toBe(11)
})

test('the band shows one line of the command, cut between code points', () => {
  expect(commandHead('\n  cd app && npm test  ')).toBe('  cd app && npm test  ')
  expect(commandHead('x'.repeat(80))).toBe(`${'x'.repeat(59)}…`)
  expect(commandHead('😀'.repeat(70))).toBe(`${'😀'.repeat(59)}…`)
})

test('a command head drops the carriage return of a CRLF command', () => {
  expect(commandHead('npm test\r\necho done\r\n')).toBe('npm test')
})
