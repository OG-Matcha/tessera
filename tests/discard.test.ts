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

test('with stashBeforeDiscard on, the discard sent again stashes the changes first; clean gets no stash', { options: { stashBeforeDiscard: true } }, async ($, on) => {
  const ran: string[] = []
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined } as never
  })
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    ran.push(argv.slice(3).join(' '))
    const out: Record<string, string> = { status: ' M src/a.ts\n', 'stash create': 'abc123\n', 'stash store': '', clean: 'Would remove tmp/\n' }
    return { value: { exitCode: 0, stdout: out[argv.slice(3, 5).join(' ')] ?? out[argv[3] ?? ''] ?? '', stderr: '' } } as never
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const reset = { tool: 'Bash', command: 'git reset --hard' } as const
  expect((await $.tool.call(reset)).deny).toContain('src/a.ts')
  expect(ran.filter(r => r.startsWith('stash'))).toEqual([])
  expect((await $.tool.call(reset)).deny).toBe(undefined)
  expect(ran.filter(r => r.startsWith('stash'))).toEqual(['stash create', 'stash store -m tessera: before git reset --hard abc123'])
  expect(toasts.at(-1)).toContain('stash@{0}')
  const clean = { tool: 'Bash', command: 'git clean -fd' } as const
  await $.tool.call(clean)
  expect((await $.tool.call(clean)).deny).toBe(undefined)
  expect(ran.filter(r => r.startsWith('stash'))).toHaveLength(2)
})

test('by default a discard sent again stashes nothing', async ($, on) => {
  const ran: string[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    ran.push(argv.slice(3).join(' '))
    return { value: { exitCode: 0, stdout: argv[3] === 'status' ? ' M src/a.ts\n' : '', stderr: '' } } as never
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const reset = { tool: 'Bash', command: 'git reset --hard' } as const
  await $.tool.call(reset)
  expect((await $.tool.call(reset)).deny).toBe(undefined)
  expect(ran.some(r => r.startsWith('stash'))).toBe(false)
})

test('guardGit off lets a discard through', { options: { guardGit: false } }, async ($, on) => {
  on('process.run', git({ status: ' M a.ts\n' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'reset' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })).deny).toBe(undefined)
})

test('two discards in one command are one reminder naming both, and the command sent again goes through', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    const out: Record<string, string> = { status: ' M src/a.ts\n', diff: 'src/b.ts\n' }
    return { value: { exitCode: 0, stdout: out[argv[3] ?? ''] ?? '', stderr: '' } } as never
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const call = { tool: 'Bash', command: 'git reset --hard && git checkout -- src/b.ts' } as const
  const first = (await $.tool.call(call)).deny
  expect(first).toContain('src/a.ts')
  expect(first).toContain('src/b.ts')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('a discard and a database reset in one command are answered by one resend', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', git({ status: ' M a.ts\n' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const call = { tool: 'Bash', command: 'git reset --hard; docker compose down -v' } as const
  const first = (await $.tool.call(call)).deny
  expect(first).toContain('a.ts')
  expect(first).toContain('docker compose down -v')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('the database guard works with the tree guard off', { options: { guardGit: false } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const call = { tool: 'Bash', command: 'npx prisma migrate reset' } as const
  expect((await $.tool.call(call)).deny).toContain('prisma migrate reset')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})
