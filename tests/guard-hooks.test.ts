import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

const ran: string[] = []

test('a junction to node_modules is refused even with no agent running', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'PowerShell' as never }, (_, e) => {
    ran.push(String((e as { command?: unknown }).command))
    return { result: 'ran' } as never
  })
  const result = await $.tool.call({ tool: 'PowerShell', command: 'New-Item -ItemType Junction -Path wt/node_modules -Target ../node_modules' } as never)
  expect(result.deny).toContain('node_modules')
  expect(ran).toEqual([])
})

// From a subdirectory git prints --git-dir absolute and --git-common-dir relative; in a worktree they differ.
const gitDirs = (gitDir: string, commonDir: string) => () => ({ value: { exitCode: 0, stdout: `${gitDir}\n${commonDir}\n`, stderr: '' } }) as never

test('an agent rewriting the main tree from a subdirectory is refused', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: 'I:/w/pkg/sub' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', gitDirs('I:/w/pkg/.git', '../.git'))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const result = await $.tool.call({ tool: 'Bash', command: 'git stash', agentId: 'a1' } as never)
  expect(result.deny).toContain('main working tree')
})

test('an agent rewriting its own worktree goes through', async ($, on) => {
  on('session.cwd', () => ({ value: '/w/wt-a' }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('process.run', gitDirs('/w/pkg/.git/worktrees/wt-a', '/w/pkg/.git'))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const result = await $.tool.call({ tool: 'Bash', command: 'git checkout -b fix', agentId: 'a1' } as never)
  expect(result.deny).toBe(undefined)
})

test('git stash with no agent running goes through', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const result = await $.tool.call({ tool: 'Bash', command: 'git stash' })
  expect(result.deny).toBe(undefined)
})

test('an Agent call with no model gets the configured one', { options: { agentModel: 'opus' } }, async ($, on) => {
  const models: (string | undefined)[] = []
  on('tool.call', { tool: 'Agent' }, (_, e) => {
    models.push(e.model)
    return { result: 'done' } as never
  })
  await $.tool.call({ tool: 'Agent', description: 'a', prompt: 'b' })
  await $.tool.call({ tool: 'Agent', description: 'a', prompt: 'b', model: 'haiku' })
  expect(models).toEqual(['opus', 'haiku'])
})

test('a Workflow that does not quote the person is refused, one that does runs', { options: { requireUserQuote: true } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.messages', () => ({ value: [{ role: 'user', text: '你先持續按照規格先幫我們把所有的內容先做起來', toolUses: [] }] }) as never)
  on('tool.call', { tool: 'Workflow' }, () => ({ result: 'started' }) as never)
  const bare = await $.tool.call({ tool: 'Workflow', script: "await agent('build it', { model: 'opus' })" })
  expect(bare.deny).toContain('quote')
  const quoted = await $.tool.call({ tool: 'Workflow', script: "const COMMON = '「你先持續按照規格先幫我們把所有的內容先做起來」'\nawait agent(COMMON, { model: 'opus' })" })
  expect(quoted.deny).toBe(undefined)
})

test('a Workflow whose agents name no model is refused when a model is configured', { options: { agentModel: 'opus' } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'Workflow' }, () => ({ result: 'started' }) as never)
  const result = await $.tool.call({ tool: 'Workflow', script: "await agent('x', { label: 'a' })" })
  expect(result.deny).toContain("model: 'opus'")
})

test('choose refuses a model-less Agent call and passes one that picked a model', { options: { agentModel: 'choose' } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'Agent' }, () => ({ result: 'done' }) as never)
  const bare = await $.tool.call({ tool: 'Agent', description: 'a', prompt: 'b' })
  expect(bare.deny).toContain('haiku for quick mechanical work')
  const picked = await $.tool.call({ tool: 'Agent', description: 'a', prompt: 'b', model: 'sonnet' })
  expect(picked.deny).toBe(undefined)
})

test('choose refuses a Workflow whose agents name no model', { options: { agentModel: 'choose' } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'Workflow' }, () => ({ result: 'started' }) as never)
  const result = await $.tool.call({ tool: 'Workflow', script: "await agent('x', { label: 'a' })" })
  expect(result.deny).toContain('the model its task needs')
})

// On Windows the session reads OS=Windows_NT at its start; the listing is what dir /AL /S /B answers.
const windows = (on: Parameters<TestBody>[1], listing: { exitCode: number; stdout: string; stderr: string } | 'timeout') => {
  on('env.get', (_, e) => ({ value: (e as { name?: string }).name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.cwd', () => ({ value: 'C:/w' }))
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }) as never)
  on('process.run', () => (listing === 'timeout' ? Promise.reject(new Error('timed out')) : { value: listing }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
}

test('on Windows a recursive delete whose target holds a junction is refused', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  windows(on, { exitCode: 0, stdout: 'C:\\w\\wt-a\\node_modules\n', stderr: '' })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  const result = await $.tool.call({ tool: 'Bash', command: 'git worktree remove --force wt-a' })
  expect(result.deny).toContain('wt-a is or holds a junction')
})

test('on Windows a listing that did not finish is a reminder, and no link listed is a pass', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  windows(on, 'timeout')
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  const call = { tool: 'Bash', command: 'rm -rf wt-a' } as const
  expect((await $.tool.call(call)).deny).toContain('could not be made')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('on Windows no link listed is a pass, whatever language dir speaks', async ($, on) => {
  windows(on, { exitCode: 1, stdout: '', stderr: '找不到檔案\n' })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' })).deny).toBe(undefined)
})

test('a reminder that was answered does not pass the refusal behind it', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('env.get', (_, e) => ({ value: (e as { name?: string }).name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.cwd', () => ({ value: 'C:/w' }))
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }) as never)
  // big-dir's listing times out; wt-b's lists a junction.
  on('process.run', (_, e) => (String((e as { argv: string[] }).argv.at(-1)).endsWith('big-dir') ? Promise.reject(new Error('timed out')) : { value: { exitCode: 0, stdout: 'C:\\w\\wt-b\\node_modules\n', stderr: '' } }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  const call = { tool: 'Bash', command: 'rm -rf big-dir wt-b' } as const
  expect((await $.tool.call(call)).deny).toContain('wt-b is or holds')
  expect((await $.tool.call(call)).deny).toContain('wt-b is or holds')
})

test('a recursive delete of home, the working directory or a parent is refused outright', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', (_, e) => ({ value: { OS: 'Windows_NT', HOME: 'C:/Users/u' }[(e as { name: string }).name] }) as never)
  on('session.start', () => ({ cwd: 'C:/w/repo' }))
  on('session.cwd', () => ({ value: 'C:/w/repo' }))
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }) as never)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  await $.session.start({ cwd: 'C:/w/repo', surface: 'terminal', isInteractive: true })
  for (const command of ['rm -rf ~', 'rm -rf $HOME', 'rm -rf ..', 'rm -rf .', 'rm -rf C:/', 'rm -rf /c/w', 'rmdir /s /q C:\\w\\repo']) {
    const deny = (await $.tool.call({ tool: 'Bash', command })).deny
    expect(deny).toContain('Name the directory meant')
    expect((await $.tool.call({ tool: 'Bash', command })).deny).toBe(deny)
  }
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' })).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf C:/w/other' })).deny).toBe(undefined)
})

test('a database reset is reminded once and runs when sent again; guardData off skips it', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('session.cwd', () => ({ value: '/w' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const call = { tool: 'Bash', command: 'docker compose down -v' } as const
  expect((await $.tool.call(call)).deny).toContain('docker compose down -v')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('guardData off reminds of nothing', { options: { guardData: false } }, async ($, on) => {
  on('session.cwd', () => ({ value: '/w' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'npx prisma migrate reset --force' })).deny).toBe(undefined)
})

test('a Git Bash path on Windows reaches the file system', async ($, on) => {
  const stats: string[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', (_, e) => ({ value: { OS: 'Windows_NT', HOME: 'C:/Users/u' }[(e as { name: string }).name] }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.cwd', () => ({ value: 'C:/w' }))
  on('fs.stat', (_, e) => {
    stats.push(String((e as { path: string }).path))
    return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true } } as never
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf /c/w/link' })).deny).toContain('is or holds a junction')
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf ~/wt' })).deny).toContain('is or holds a junction')
  // A POSIX engine roots C:/… under its working directory, so the tails are what count.
  expect(stats.map(s => s.replace(/\\/g, '/')).map((s, i) => s.endsWith(['C:/w/link', 'C:/Users/u/wt'][i]!))).toEqual([true, true])
})

// A file's bytes as the engine hands them to the guard.
const bytesOf = (on: Parameters<TestBody>[1], files: Record<string, Uint8Array>) => {
  // A POSIX engine roots C:/… under its working directory, so the tail is what counts.
  const fileAt = (e: unknown) => Object.entries(files).find(([key]) => String((e as { path: string }).path).replace(/\\/g, '/').endsWith(key))?.[1]
  on('fs.stat', (_, e) => {
    const file = fileAt(e)
    return (file === undefined ? Promise.reject(new Error('ENOENT')) : { value: { kind: 'file', size: file.length, mtimeMs: 0, isLink: false } }) as never
  })
  on('fs.read', (_, e) => ({ value: { base64: btoa(String.fromCharCode(...(fileAt(e) ?? new Uint8Array()))) } }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('tool.call', { tool: 'Edit' }, () => ({ result: 'edited' }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
}

test('an edit to a file that is not UTF-8 is reminded once, then that file is let be for the session', async ($, on) => {
  bytesOf(on, { 'C:/p/menu.txt': new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5, 0x0a]), 'C:/p/ok.txt': new TextEncoder().encode('中文\n') })
  const edit = { tool: 'Edit', file_path: 'C:/p/menu.txt', old_string: 'a', new_string: 'b' } as never
  expect((await $.tool.call(edit)).deny).toContain('#7134')
  expect((await $.tool.call(edit)).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/p/menu.txt', old_string: 'c', new_string: 'd' } as never)).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/p/ok.txt', old_string: 'a', new_string: 'b' } as never)).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Write', file_path: 'C:/p/new.txt', content: 'x' } as never)).deny).toBe(undefined)
})

test('guardEncoding off reads nothing', { options: { guardEncoding: false } }, async ($, on) => {
  let reads = 0
  on('fs.stat', () => {
    reads++
    return { value: { kind: 'file', size: 5, mtimeMs: 0, isLink: false } } as never
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: 'edited' }) as never)
  expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/p/menu.txt', old_string: 'a', new_string: 'b' } as never)).deny).toBe(undefined)
  expect(reads).toBe(0)
})

test('elsewhere only a target that is itself a link is refused', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('fs.stat', (_, e) => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: /[\\/]link$/.test(String(e.path)) } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/w/wt-a/node_modules\n', stderr: '' } }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'git worktree remove --force wt-a' })).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf link' })).deny).toContain('link is or holds a junction')
})

test('a recursive delete with no link inside goes through', async ($, on) => {
  on('session.cwd', () => ({ value: '/w' }))
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }) as never)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const result = await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' })
  expect(result.deny).toBe(undefined)
})

test('a todo written with CJK escapes is refused before it reaches the tool', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: 'ok' }) as never)
  const result = await $.tool.call({ tool: 'TodoWrite', todos: [{ content: '\\uD55C\\uAD6D', status: 'pending', activeForm: 'x' }] } as never)
  expect(result.deny).toContain('#83033')
})

test('CJK escapes in a code file holding CJK are a reminder, in prose a refusal', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  const hangul = String.fromCharCode(0xd55c, 0xad6d)
  const escaped = '\\uD55C\\uAD6D'
  const code = { tool: 'Write', file_path: 'C:/p/escape.test.ts', content: `expect(escape('${hangul}')).toBe('${escaped}')` } as never
  expect((await $.tool.call(code)).deny).toContain('send the same call again')
  expect((await $.tool.call(code)).deny).toBe(undefined)
  const prose = { tool: 'Write', file_path: 'C:/p/notes.md', content: escaped } as never
  expect((await $.tool.call(prose)).deny).toContain('#83033')
  expect((await $.tool.call(prose)).deny).toContain('#83033')
})

test('an unquoted heredoc that would expand code is refused once, and goes through when sent again', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const call = { tool: 'Bash', command: 'cat > a.ts <<EOF\nconst s = `${name}`\nEOF' } as const
  expect((await $.tool.call(call)).deny).toContain("<<'EOF'")
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('two reminded calls in a row each go through when sent again, and a reminder expires', async ($, on) => {
  let now = 0
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: now }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const a = { tool: 'Bash', command: 'cat > a.ts <<EOF\nconst s = `${name}`\nEOF' } as const
  const b = { tool: 'Bash', command: 'cat > b.ts <<EOF\nconst t = `${name}`\nEOF' } as const
  expect((await $.tool.call(a)).deny).toBeDefined()
  expect((await $.tool.call(b)).deny).toBeDefined()
  expect((await $.tool.call(a)).deny).toBe(undefined)
  expect((await $.tool.call(b)).deny).toBe(undefined)
  expect((await $.tool.call(a)).deny).toBeDefined()
  now = 11 * 60_000
  expect((await $.tool.call(a)).deny).toBeDefined()
})

test('a deny still goes out when the toast throws', async ($, on) => {
  on('ui.toast', () => {
    throw new Error('no toast here')
  })
  on('tool.call', { tool: 'PowerShell' as never }, () => ({ result: 'ran' }) as never)
  const result = await $.tool.call({ tool: 'PowerShell', command: 'New-Item -ItemType Junction -Path wt/node_modules -Target ../node_modules' } as never)
  expect(result.deny).toContain('node_modules')
})

test('guardHeredoc off adds nothing', { options: { guardHeredoc: false } }, async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'cat > a.ts <<EOF\nconst s = `${name}`\nEOF' })).deny).toBe(undefined)
})

test('a write with a wording the CLAUDE.md glossary avoids is refused once', { options: { guardGlossary: true } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('session.repo', () => ({ value: { root: 'C:/p' } }) as never)
  on('fs.read', (_, e) => ({ value: String((e as { path?: unknown }).path).endsWith('CLAUDE.md') ? '| 用語 | 避免 |\n|---|---|\n| 全文完 | 通關 |\n' : '' }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  const call = { tool: 'Write', file_path: 'C:/p/src/end.ts', content: "export const TITLE = '通關'" } as never
  expect((await $.tool.call(call)).deny).toContain('通關→全文完')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('the glossary guard is off unless turned on', async ($, on) => {
  on('session.repo', () => ({ value: { root: 'C:/p' } }) as never)
  on('fs.read', (_, e) => ({ value: String((e as { path?: unknown }).path).endsWith('CLAUDE.md') ? '| 用語 | 避免 |\n|---|---|\n| 全文完 | 通關 |\n' : '' }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  expect((await $.tool.call({ tool: 'Write', file_path: 'C:/p/src/end.ts', content: "export const TITLE = '通關'" } as never)).deny).toBe(undefined)
})

test('auto fills the model Haiku picks for the task and names it in a toast', { options: { agentModel: 'auto', language: 'en' } }, async ($, on) => {
  const toasts: string[] = []
  const sent: unknown[] = []
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined } as never
  })
  on('model.classify', (_, e) => ({ value: e.labels.find(l => l.startsWith('haiku')) }) as never)
  on('tool.call', { tool: 'Agent' }, (_, e) => {
    sent.push(e.model)
    return { result: 'done' } as never
  })
  await $.tool.call({ tool: 'Agent', description: 'find the config file', prompt: 'List where settings are read.' })
  expect(sent).toEqual(['haiku'])
  expect(toasts.join(' ')).toContain('find the config file → haiku')
})

test('auto leaves agent types with their own model, and lets the call through when classifying fails', { options: { agentModel: 'auto' } }, async ($, on) => {
  const sent: unknown[] = []
  on('model.classify', () => {
    throw new Error('offline')
  })
  on('tool.call', { tool: 'Agent' }, (_, e) => {
    sent.push(e.model)
    return { result: 'done' } as never
  })
  await $.tool.call({ tool: 'Agent', description: 'a', prompt: 'b', subagent_type: 'Explore' })
  await $.tool.call({ tool: 'Agent', description: 'a', prompt: 'b' })
  expect(sent).toEqual([undefined, undefined])
})

test('with no setting, an Agent call with no model gets one picked', async ($, on) => {
  const sent: unknown[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('model.classify', (_, e) => ({ value: e.labels.find(l => l.startsWith('sonnet')) }) as never)
  on('tool.call', { tool: 'Agent' }, (_, e) => {
    sent.push(e.model)
    return { result: 'done' } as never
  })
  await $.tool.call({ tool: 'Agent', description: 'add a test', prompt: 'Add a unit test for parse().' })
  expect(sent).toEqual(['sonnet'])
})

test('auto reminds a Workflow without models once, and runs the same script when sent again', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('tool.call', { tool: 'Workflow' }, () => ({ result: 'started' }) as never)
  const call = { tool: 'Workflow', script: "await agent('x', { label: 'a' })" } as const
  expect((await $.tool.call(call)).deny).toContain('the model its task needs')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('a force push to main is refused once, and goes through when sent again', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('session.cwd', () => ({ value: '/w' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'pushed' }) as never)
  const call = { tool: 'Bash', command: 'git push --force origin main' } as const
  expect((await $.tool.call(call)).deny).toContain('force-pushes to main')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('a bare force push asks git for the branch, and a feature branch goes through', async ($, on) => {
  let branch = 'master'
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('session.cwd', () => ({ value: '/w' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${branch}
`, stderr: '' } }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'pushed' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'git push -f' })).deny).toContain('force-pushes to master')
  branch = 'feature/x'
  expect((await $.tool.call({ tool: 'Bash', command: 'git push --force-with-lease' })).deny).toBe(undefined)
})

test('the blocked toast names the rule in the person’s language', { options: { language: 'zh-TW' } }, async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined } as never
  })
  on('clock.now', () => ({ value: 0 }) as never)
  on('session.cwd', () => ({ value: '/w' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'pushed' }) as never)
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect(toasts).toEqual(['tessera 已請 Claude 再確認：強制推送'])
})

test('on Windows without HOME, a delete of ~, $HOME or %USERPROFILE% is the home directory and refused', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  on('session.id', () => ({ value: 's' }) as never)
  on('session.repo', () => ({ value: { root: 'C:/w' } }) as never)
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', () => ({ value: undefined }) as never)
  on('env.get', (_, e) => ({ value: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' }[(e as { name?: string }).name ?? ''] }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.cwd', () => ({ value: 'C:/w' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  // PowerShell is in the Windows build's tool table only, so the name is cast for the Linux typecheck.
  on('tool.call', { tool: 'PowerShell' as 'Bash' }, () => ({ result: 'ran' }) as never)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  for (const command of ['rm -rf ~', 'rm -rf $HOME/', 'rm -rf /c/Users/ME', 'rm -rf /c']) expect((await $.tool.call({ tool: 'Bash', command })).deny).toContain('home directory')
  expect((await $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse $env:USERPROFILE' } as never)).deny).toContain('home directory')
  expect((await $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse %USERPROFILE%\\tmp' } as never)).deny).toBe(undefined)
})

test('on Windows a target holding a cmd operator is never listed, only reminded', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }) as never)
  let listed = 0
  on('env.get', (_, e) => ({ value: (e as { name?: string }).name === 'OS' ? 'Windows_NT' : undefined }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.cwd', () => ({ value: 'C:/w' }))
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }) as never)
  on('process.run', () => {
    listed++
    return { value: { exitCode: 1, stdout: '', stderr: '' } } as never
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  const call = { tool: 'Bash', command: 'rm -rf "x & calc"' } as const
  expect((await $.tool.call(call)).deny).toContain('could not be made')
  expect(listed).toBe(0)
  expect((await $.tool.call(call)).deny).toBe(undefined)
})
