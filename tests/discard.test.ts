import { expect, test } from 'claude-code/testing'

import { discards } from '../hooks/guard'

test('finds the git calls that throw away uncommitted work', () => {
  expect(discards('git reset --hard HEAD~1')).toEqual([{ verb: 'reset', args: [] }])
  expect(discards('git checkout -- src/a.ts')).toEqual([{ verb: 'checkout', args: ['src/a.ts'] }])
  expect(discards('git checkout .')).toEqual([{ verb: 'checkout', args: ['.'] }])
  expect(discards('git restore src/a.ts')).toEqual([{ verb: 'restore', args: ['src/a.ts'] }])
  expect(discards('git clean -fd')).toEqual([{ verb: 'clean', args: ['-fd'] }])
  expect(discards('npm test && git reset --hard')).toHaveLength(1)
})

test('leaves alone the calls that keep the work', () => {
  for (const command of ['git checkout main', 'git checkout -b fix', 'git switch dev', 'git reset HEAD a.ts', 'git reset --soft HEAD~1', 'git restore --staged a.ts', 'git clean -n', 'git status'])
    expect(discards(command)).toEqual([])
})

// git status --porcelain for reset, git diff --name-only for checkout and restore, git clean -n for clean.
const git = (out: Record<string, string>) => (_: unknown, e: unknown) => {
  const argv = (e as { argv: string[] }).argv
  return { value: { exitCode: 0, stdout: out[argv[3] ?? ''] ?? '', stderr: '' } } as never
}

test('a hard reset over uncommitted changes is refused once, naming them, and goes through when sent again', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', git({ status: ' M src/a.ts\nM  src/b.ts\n' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'reset' }) as never)
  const call = { tool: 'Bash', command: 'git reset --hard' } as const
  const first = (await $.tool.call(call)).deny
  expect(first).toContain('src/a.ts, src/b.ts')
  expect(first).toContain('git stash')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('a discard with nothing to lose goes through at once', async ($, on) => {
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', git({}))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'done' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'git checkout -- .' })).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Bash', command: 'git clean -fd' })).deny).toBe(undefined)
})

test('clean names the untracked files git would remove', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', git({ clean: 'Would remove notes.md\nWould remove tmp/\n' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'done' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'git clean -fd' })).deny).toContain('untracked files notes.md, tmp/')
})

test('guardGit off lets a discard through', { options: { guardGit: false } }, async ($, on) => {
  on('process.run', git({ status: ' M a.ts\n' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'reset' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })).deny).toBe(undefined)
})
