import { expect, test } from 'claude-code/testing'

const ran: string[] = []

test('a junction to node_modules is refused even with no agent running', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'PowerShell' }, (_, e) => {
    ran.push(e.command)
    return { result: 'ran' } as never
  })
  const result = await $.tool.call({ tool: 'PowerShell', command: 'New-Item -ItemType Junction -Path wt/node_modules -Target ../node_modules' })
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
