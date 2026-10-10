import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

// What session.start sets for Python, given the OS and whether the person set PYTHONUTF8 already.
const startOn = (os: string | undefined, preset: string | undefined, expected: [string, unknown][]) => async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) => {
  const writes: [string, unknown][] = []
  on('env.get', (_, e) => {
    const name = (e as { name?: string }).name
    return { value: name === 'OS' ? os : name === 'PYTHONUTF8' ? preset : name === 'CLAUDE_CODE_ENABLE_TODO_TOOLS' ? '1' : undefined } as never
  })
  on('env.set', (_, e) => {
    writes.push([(e as { name: string }).name, (e as { value?: unknown }).value])
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(writes.filter(([name]) => name === 'PYTHONUTF8')).toEqual(expected)
}

test('on Windows the session gets PYTHONUTF8=1', startOn('Windows_NT', undefined, [['PYTHONUTF8', '1']]))

test('a value the person set stands', startOn('Windows_NT', '0', []))

test('nothing is set elsewhere', startOn(undefined, undefined, []))

test('pythonUtf8 off sets nothing', { options: { pythonUtf8: false } }, startOn('Windows_NT', undefined, []))

test('pythonUtf8 off unsets what tessera set in an earlier session, not what the person set', { options: { pythonUtf8: false } }, async ($, on) => {
  const writes: [string, unknown][] = []
  let noted: unknown = ['PYTHONUTF8']
  on('env.get', (_, e) => ({ value: { OS: 'Windows_NT', PYTHONUTF8: '1', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' }[(e as { name: string }).name] }) as never)
  on('env.set', (_, e) => {
    writes.push([(e as { name: string }).name, (e as { value?: unknown }).value])
    return { value: undefined } as never
  })
  on('store.get', (_, e) => ({ value: (e as { key?: string }).key === 'setVars' ? noted : undefined }) as never)
  on('store.set', (_, e) => {
    if ((e as { key?: string }).key === 'setVars') noted = (e as { value?: unknown }).value
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(writes).toEqual([['PYTHONUTF8', undefined]])
  expect(noted).toEqual([])
  writes.length = 0
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(writes).toEqual([])
})
