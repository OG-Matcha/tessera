import { expect, test } from 'claude-code/testing'

import { carriedFrom, openItems, recordSession, restoredTasks } from '../hooks/carry'

test('open items are the tasks and todos not completed', () => {
  const log = {
    tasks: new Map([
      ['1', { subject: 'fix the parser', status: 'completed' as const }],
      ['2', { subject: 'add tests', status: 'in_progress' as const }],
    ]),
    todos: [
      { content: 'update README', status: 'pending' as const },
      { content: 'bump version', status: 'completed' as const },
    ],
  }
  expect(openItems(log)).toEqual(['add tests', 'update README'])
})

test('the store keeps the newest five sessions', () => {
  let store = {}
  for (let i = 0; i < 7; i++) store = recordSession(store, `s${i}`, i, { tasks: new Map([[String(i), { subject: `item ${i}`, status: 'pending' }]]), todos: [] })
  expect(Object.keys(store).sort()).toEqual(['s2', 's3', 's4', 's5', 's6'])
})

test('the offer is the latest other session, and nothing when it finished its list', () => {
  const store = { a: { at: 1, open: ['old'] }, b: { at: 2, open: ['left over'] }, now: { at: 3, open: ['mine'] } }
  expect(carriedFrom(store, 'now')).toEqual({ from: 'b', items: ['left over'] })
  expect(carriedFrom({ ...store, c: { at: 2.5, open: [] } }, 'now')).toBe(undefined)
  expect(carriedFrom({}, 'now')).toBe(undefined)
})

test('a reloaded module gets the session task list back with its ids', () => {
  const store = recordSession({}, 'now', 1, { tasks: new Map([['4', { subject: 'ship it', status: 'in_progress' as const }]]), todos: [] })
  expect(restoredTasks(store, 'now').get('4')).toEqual({ subject: 'ship it', status: 'in_progress' })
  expect(restoredTasks(store, 'other').size).toBe(0)
})
