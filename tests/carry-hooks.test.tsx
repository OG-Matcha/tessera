import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

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

const startWith = (preset: string | undefined, expected: [string, unknown][]) => async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) => {
  const writes: [string, unknown][] = []
  on('env.get', (_, e) => ({ value: (e as { name?: string }).name === 'CLAUDE_CODE_ENABLE_TODO_TOOLS' ? preset : undefined }) as never)
  on('env.set', (_, e) => {
    writes.push([(e as { name: string }).name, (e as { value?: unknown }).value])
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(writes.filter(([name]) => name === 'CLAUDE_CODE_ENABLE_TODO_TOOLS')).toEqual(expected)
}

test('carry-over turns on the task tools for the session when nobody chose', startWith(undefined, [['CLAUDE_CODE_ENABLE_TODO_TOOLS', '1']]))

test('a task-tools setting the person made stands', startWith('0', []))

test('after /clear the cleared conversation is offered and its tasks are not kept again', { options: { language: 'en' } }, async ($, on) => {
  let session = 'old'
  let store: unknown
  on('session.repo', () => ({ value: { root: 'C:/p' } }) as never)
  on('session.id', () => ({ value: session }) as never)
  const clock = mock.clock(on)
  on('store.get', () => ({ value: store }) as never)
  on('store.set', (_, e) => {
    store = (e as { value?: unknown }).value
    return { value: undefined } as never
  })
  on('tool.call', { tool: 'TaskCreate' }, (_, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.end', (_, e) => ({ sessionId: e.sessionId }) as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'add tests', description: 'x' })
  await $.session.end({ reason: 'clear', sessionId: 'old', resume: { id: 'old' } } as never)
  await clock.advance(100)
  session = 'new'
  await clock.advance(100)
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect(await ui.find({ type: 'Text', text: '1 unfinished from your last session here' })).toBeDefined()
  await $.tool.call({ tool: 'TaskCreate', subject: 'fresh', description: 'y' })
  expect((store as Record<string, { open: string[] }>).new?.open).toEqual(['fresh'])
})
