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
