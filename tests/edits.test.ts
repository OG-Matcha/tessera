import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { EDIT_WINDOW_MS, prune, recentEdit, remember } from '../hooks/edits'

const MIN = 60_000
const mine = (s: string) => s === 'mine'

test('another session’s edit inside the window is found, with how long ago; its own and old ones are not', () => {
  const log = { 'c:/w/a.ts': { session: 'other', at: 10 * MIN }, 'c:/w/b.ts': { session: 'mine', at: 10 * MIN }, 'c:/w/c.ts': { session: 'other', at: 0 } }
  expect(recentEdit(log, 'C:/w/a.ts', mine, 13 * MIN)).toEqual({ session: 'other', ago: '3 minutes ago' })
  expect(recentEdit(log, 'C:\\w\\a.ts', mine, 10 * MIN + 20_000)?.ago).toBe('less than a minute ago')
  expect(recentEdit(log, 'c:/W/A.ts', mine, 11 * MIN)?.ago).toBe('a minute ago')
  expect(recentEdit(log, 'C:/w/b.ts', mine, 13 * MIN)).toBe(undefined)
  expect(recentEdit(log, 'C:/w/c.ts', mine, EDIT_WINDOW_MS + 1)).toBe(undefined)
  expect(recentEdit(log, 'C:/w/d.ts', mine, 13 * MIN)).toBe(undefined)
  // A POSIX path keeps its case: /tmp/A and /tmp/a are two files.
  expect(recentEdit({ '/w/A.ts': { session: 'other', at: 10 * MIN } }, '/w/a.ts', mine, 11 * MIN)).toBe(undefined)
})

test('remembering an edit drops the entries outside the window and keys a Windows path with slashes and no case', () => {
  const log = { 'c:/w/old.ts': { session: 'other', at: 0 }, 'c:/w/a.ts': { session: 'other', at: 20 * MIN } }
  expect(remember(log, 'C:\\w\\B.ts', 'mine', EDIT_WINDOW_MS + 1)).toEqual({ 'c:/w/a.ts': { session: 'other', at: 20 * MIN }, 'c:/w/b.ts': { session: 'mine', at: EDIT_WINDOW_MS + 1 } })
  expect(prune(log, EDIT_WINDOW_MS + 1)).toEqual({ 'c:/w/a.ts': { session: 'other', at: 20 * MIN } })
  expect(prune(log, 21 * MIN)).toBe(log)
})

type Mock = Parameters<TestBody>[1]

const sharedStore = (on: Mock, edits: unknown) => {
  const store = { edits }
  on('store.get', (_, e) => ({ value: store[(e as { key: string }).key as 'edits'] }) as never)
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    if (key === 'edits') store.edits = value
    return { value: undefined } as never
  })
  on('session.id', () => ({ value: 'mine' }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'Edit' }, () => ({ result: 'edited' }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  return store
}

test('an edit to a file another session edited lately is refused once, then goes through and is noted', async ($, on) => {
  const store = sharedStore(on, { 'c:/w/a.ts': { session: 'other', at: 5 * MIN } })
  on('clock.now', () => ({ value: 8 * MIN }) as never)
  const edit = { tool: 'Edit', file_path: 'C:/w/a.ts', old_string: 'a', new_string: 'b' } as never
  const first = (await $.tool.call(edit)).deny
  expect(first).toContain('another Claude Code session')
  expect(first).toContain('3 minutes ago')
  expect(store.edits).toEqual({ 'c:/w/a.ts': { session: 'other', at: 5 * MIN } })
  expect((await $.tool.call(edit)).deny).toBe(undefined)
  expect(store.edits).toEqual({ 'c:/w/a.ts': { session: 'mine', at: 8 * MIN } })
})

test('a file nobody else touched lately goes through at once and is noted for the other sessions', async ($, on) => {
  const store = sharedStore(on, { 'c:/w/a.ts': { session: 'mine', at: 5 * MIN }, 'c:/w/old.ts': { session: 'other', at: 0 } })
  on('clock.now', () => ({ value: 40 * MIN }) as never)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/w/a.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Write', file_path: 'C:/w/new.ts', content: 'x' } as never)).deny).toBe(undefined)
  expect(store.edits).toEqual({ 'c:/w/a.ts': { session: 'mine', at: 40 * MIN }, 'c:/w/new.ts': { session: 'mine', at: 40 * MIN } })
})

test('entries past the window are dropped when the log is read, not only when it is written', async ($, on) => {
  // The engine denies this one, so nothing is noted: the read alone pruned the store.
  on('tool.call', { tool: 'Edit' }, () => ({ deny: 'no' }) as never)
  const store = sharedStore(on, { 'c:/w/old.ts': { session: 'other', at: 0 } })
  on('clock.now', () => ({ value: EDIT_WINDOW_MS + 1 }) as never)
  await $.tool.call({ tool: 'Edit', file_path: 'C:/w/b.ts', old_string: 'a', new_string: 'b' } as never)
  expect(store.edits).toEqual({})
})

test('an edit another plugin or the engine denied is not noted', async ($, on) => {
  on('tool.call', { tool: 'Write' }, () => ({ deny: 'not here' }) as never)
  const store = sharedStore(on, {})
  on('clock.now', () => ({ value: 5 * MIN }) as never)
  await $.tool.call({ tool: 'Write', file_path: 'C:/w/x.ts', content: 'x' } as never)
  expect(store.edits).toEqual({})
})

test('after /clear the cleared conversation’s own edits are not another session’s', { options: { carryOver: false } }, async ($, on) => {
  sharedStore(on, { 'c:/w/a.ts': { session: 'before-clear', at: 5 * MIN } })
  on('clock.now', () => ({ value: 6 * MIN }) as never)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }) as never)
  const edit = { tool: 'Edit', file_path: 'C:/w/a.ts', old_string: 'a', new_string: 'b' } as never
  expect((await $.tool.call(edit)).deny).toContain('another Claude Code session')
  await $.session.end({ reason: 'clear', sessionId: 'before-clear', resume: { id: 'before-clear' } } as never)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/w/other.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBe(undefined)
  expect((await $.tool.call(edit)).deny).toBe(undefined)
})

test('with the session guard off nothing is checked or noted', { options: { guardSessions: false } }, async ($, on) => {
  const store = sharedStore(on, { 'c:/w/a.ts': { session: 'other', at: 5 * MIN } })
  on('clock.now', () => ({ value: 6 * MIN }) as never)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/w/a.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBe(undefined)
  expect(store.edits).toEqual({ 'c:/w/a.ts': { session: 'other', at: 5 * MIN } })
})

test('the session guard runs when every other guard is off', { options: { guardGit: false, guardCjkEscapes: false, guardEncoding: false, guardData: false, guardSimplified: 'off', guardHeredoc: false, agentModel: 'off' } }, async ($, on) => {
  sharedStore(on, { 'c:/w/a.ts': { session: 'other', at: 5 * MIN } })
  on('clock.now', () => ({ value: 6 * MIN }) as never)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/w/a.ts', old_string: 'a', new_string: 'b' } as never)).deny).toContain('another Claude Code session')
})
