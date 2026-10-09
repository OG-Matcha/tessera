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

test('a recursive delete whose target holds a junction is refused', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('fs.stat', (_, e) => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: e.path.endsWith('/link') } }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/w/wt-a/node_modules\n', stderr: '' } }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const result = await $.tool.call({ tool: 'Bash', command: 'git worktree remove --force wt-a' })
  expect(result.deny).toContain('wt-a is or holds a junction')
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

test('an unquoted heredoc that would expand code is refused once, and goes through when sent again', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  const call = { tool: 'Bash', command: 'cat > a.ts <<EOF\nconst s = `${name}`\nEOF' } as const
  expect((await $.tool.call(call)).deny).toContain("<<'EOF'")
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('guardHeredoc off adds nothing', { options: { guardHeredoc: false } }, async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ran' }) as never)
  expect((await $.tool.call({ tool: 'Bash', command: 'cat > a.ts <<EOF\nconst s = `${name}`\nEOF' })).deny).toBe(undefined)
})

test('a write with a wording the CLAUDE.md glossary avoids is refused once', { options: { guardGlossary: true } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
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
  on('tool.call', { tool: 'Workflow' }, () => ({ result: 'started' }) as never)
  const call = { tool: 'Workflow', script: "await agent('x', { label: 'a' })" } as const
  expect((await $.tool.call(call)).deny).toContain('the model its task needs')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('a force push to main is refused once, and goes through when sent again', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/w' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'pushed' }) as never)
  const call = { tool: 'Bash', command: 'git push --force origin main' } as const
  expect((await $.tool.call(call)).deny).toContain('force-pushes to main')
  expect((await $.tool.call(call)).deny).toBe(undefined)
})

test('a bare force push asks git for the branch, and a feature branch goes through', async ($, on) => {
  let branch = 'master'
  on('ui.toast', () => ({ value: undefined }))
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
  on('session.cwd', () => ({ value: '/w' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'pushed' }) as never)
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect(toasts).toEqual(['tessera 已攔下：強制推送'])
})
