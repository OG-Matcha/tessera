import { expect, test } from 'claude-code/testing'

import { carriedFrom, endSession, openItems, recordSession, restoredTasks } from '../hooks/carry'

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

test('the offer is the latest other session that ended, and nothing when it finished its list', () => {
  const store = { a: { at: 1, open: ['old'], ended: true as const }, b: { at: 2, open: ['left over'], ended: true as const }, now: { at: 3, open: ['mine'] } }
  expect(carriedFrom(store, 'now', 4)).toEqual({ from: 'b', items: ['left over'] })
  expect(carriedFrom({ ...store, c: { at: 2.5, open: [], ended: true as const } }, 'now', 4)).toBe(undefined)
  expect(carriedFrom({}, 'now', 4)).toBe(undefined)
})

test('a session still running in another terminal is not offered until it ends or goes quiet for two hours', () => {
  const hour = 60 * 60_000
  const live = { other: { at: 10 * hour, open: ['in progress'] } }
  expect(carriedFrom(live, 'now', 11 * hour)).toBe(undefined)
  expect(carriedFrom(live, 'now', 13 * hour)).toEqual({ from: 'other', items: ['in progress'] })
  expect(carriedFrom(endSession(live, 'other', 11 * hour), 'now', 11 * hour)).toEqual({ from: 'other', items: ['in progress'] })
  expect(endSession({}, 'unknown', 1)).toEqual({})
})

test('a reloaded module gets the session task list back with its ids', () => {
  const store = recordSession({}, 'now', 1, { tasks: new Map([['4', { subject: 'ship it', status: 'in_progress' as const }]]), todos: [] })
  expect(restoredTasks(store, 'now').get('4')).toEqual({ subject: 'ship it', status: 'in_progress' })
  expect(restoredTasks(store, 'other').size).toBe(0)
})

test('with the registry of running sessions, a session not in it is over whatever its record says, and one in it is not', () => {
  const store = { other: { at: 10, open: ['in progress'] }, now: { at: 10, open: [] } }
  expect(carriedFrom(store, 'now', 11, new Set(['now']))).toEqual({ from: 'other', items: ['in progress'] })
  expect(carriedFrom(store, 'now', 11, new Set(['now', 'other']))).toBe(undefined)
  expect(carriedFrom(store, 'now', 11, new Set())).toEqual({ from: 'other', items: ['in progress'] })
})
