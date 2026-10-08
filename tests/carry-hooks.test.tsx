import { expect, test } from 'claude-code/testing'

test('task tool calls record what stays open for this repository', async ($, on) => {
  const saved: unknown[] = []
  on('session.repo', () => ({ value: { root: 'C:/p' } }) as never)
  on('session.id', () => ({ value: 'now' }) as never)
  on('clock.now', () => ({ value: 1000 }) as never)
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', (_, e) => {
    saved.push((e as { value?: unknown }).value)
    return { value: undefined } as never
  })
  on('tool.call', { tool: 'TaskCreate' }, (_, e) => ({ result: { task: { id: e.subject === 'a' ? '1' : '2', subject: e.subject } } }) as never)
  on('tool.call', { tool: 'TaskUpdate' }, () => ({ result: { success: true, taskId: '1', updatedFields: ['status'] } }) as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'a', description: 'x' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'b', description: 'y' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  expect((saved.at(-1) as Record<string, { open: string[] }>).now?.open).toEqual(['b'])
})

test('the offer draws above the prompt with continue and dismiss', { options: { language: 'en' } }, async ($, on) => {
  on('state.get', (_, e) => ({ value: { value: (e as { key?: string }).key === 'carryOver' ? { from: 'b', items: ['add tests', 'update README'] } : [], version: 1 } }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect(await ui.find({ type: 'Text', text: '2 unfinished from your last session here' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '· add tests' })).toBeDefined()
  expect((await ui.find({ type: 'Button' }))?.props.label).toBe('continue')
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
})

test('carryOver off records nothing', { options: { carryOver: false } }, async ($, on) => {
  const saved: unknown[] = []
  on('store.set', (_, e) => {
    saved.push((e as { value?: unknown }).value)
    return { value: undefined } as never
  })
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: '1', subject: 'a' } } }) as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'a', description: 'x' })
  expect(saved).toEqual([])
})
