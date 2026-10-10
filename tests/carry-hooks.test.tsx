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

test('after a reload, completing a task made before it updates what is kept', async ($, on) => {
  let store: unknown = { now: { at: 1, open: ['ship it'], tasks: { '4': { subject: 'ship it', status: 'pending' } } } }
  on('session.repo', () => ({ value: { root: 'C:/p' } }) as never)
  on('session.id', () => ({ value: 'now' }) as never)
  on('clock.now', () => ({ value: 2 }) as never)
  on('env.get', () => ({ value: '1' }) as never)
  on('store.get', (_, e) => ({ value: String((e as { key?: string }).key).startsWith('carry:') ? store : undefined }) as never)
  on('store.set', (_, e) => {
    if (String((e as { key?: string }).key).startsWith('carry:')) store = (e as { value?: unknown }).value
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  on('tool.call', { tool: 'TaskUpdate' }, () => ({ result: { success: true, taskId: '4', updatedFields: ['status'] } }) as never)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: false })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '4', status: 'completed' })
  expect((store as Record<string, { open: string[] }>).now?.open).toEqual([])
})

test('a new session speaks the language the person wrote in last time', async ($, on) => {
  on('env.get', (_, e) => ({ value: (e as { name?: string }).name === 'LANG' ? 'en_US.UTF-8' : '1' }) as never)
  on('store.get', (_, e) => ({ value: (e as { key?: string }).key === 'wroteLang' ? 'zh-TW' : undefined }) as never)
  on('state.get', (_, e) => ({ value: { value: (e as { key?: string }).key === 'carryOver' ? { from: 'b', items: ['add tests'] } : [], version: 1 } }) as never)
  on('session.start', () => ({ cwd: '/tmp' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: false })
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 80, rows: 20 } } as never)
  expect((await ui.find({ type: 'Button' }))?.props.label).toBe('接續')
})

test('at exit the record is marked ended with no repository lookup, which the short end bound cannot afford', async ($, on) => {
  let repoLookups = 0
  let store: unknown = {}
  on('session.repo', () => {
    repoLookups++
    return { value: { root: 'C:/p' } } as never
  })
  on('session.id', () => ({ value: 'now' }) as never)
  on('clock.now', () => ({ value: 5 }) as never)
  on('env.get', () => ({ value: '1' }) as never)
  on('store.get', (_, e) => ({ value: String((e as { key?: string }).key).startsWith('carry:') ? store : undefined }) as never)
  on('store.set', (_, e) => {
    if (String((e as { key?: string }).key).startsWith('carry:')) store = (e as { value?: unknown }).value
    return { value: undefined } as never
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  on('tool.call', { tool: 'TaskCreate' }, (_, e) => ({ result: { task: { id: '1', subject: e.subject } } }) as never)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }) as never)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: false })
  await $.tool.call({ tool: 'TaskCreate', subject: 'ship it', description: 'x' })
  const lookups = repoLookups
  await $.session.end({ reason: 'exit', sessionId: 'now', resume: { id: 'now' } } as never)
  expect(repoLookups).toBe(lookups)
  const record = (store as Record<string, { ended?: true; open: string[] }>).now
  expect(record?.ended).toBe(true)
  expect(record?.open).toEqual(['ship it'])
})

test('a task tool runs once and keeps its result when recording it fails', async ($, on) => {
  let runs = 0
  on('session.repo', () => {
    throw new Error('repo lookup failed')
  })
  on('session.cwd', () => {
    throw new Error('cwd lookup failed')
  })
  on('tool.call', { tool: 'TaskCreate' }, (_, e) => {
    runs++
    return { result: { task: { id: '1', subject: e.subject } } } as never
  })
  const out = await $.tool.call({ tool: 'TaskCreate', subject: 'a', description: 'x' })
  expect(runs).toBe(1)
  expect((out.result as { task?: { id: string } }).task?.id).toBe('1')
})
