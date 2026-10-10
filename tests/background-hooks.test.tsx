import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const MINUTE = 60_000
// What the Bash tool really answers for a backgrounded command: no stdout, the task id.
const started = (id = 'bg1', more: Record<string, unknown> = {}) => ({ stdout: '', stderr: '', interrupted: false, backgroundTaskId: id, ...more })

type On = Parameters<TestBody>[1]
// The engine spells paths with the host's separator.
const slashed = (path: string) => path.replace(/\\/g, '/')
// The paste cache root on Windows holds <project>/<session>/tasks, where the engine writes task output.
const sessionDirs = (on: On) => {
  on('env.get', (_, e) => ({ value: { OS: 'Windows_NT', TEMP: 'C:/tmp' }[(e as { name: string }).name] }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('fs.list', () => ({ value: [{ name: 'C--w', kind: 'dir' }] }) as never)
  on('fs.exists', (_, e) => ({ value: slashed((e as { path: string }).path).endsWith('/C--w/s1/tasks') }) as never)
}

const mountBand = ($: Parameters<TestBody>[0]) =>
  $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 }, viewport: { columns: 100, rows: 20 } } as never)

test('a quiet background command is announced, growth takes the row down, and it is announced again', { options: { language: 'en', backgroundQuietMinutes: 2, carryOver: false, pastePreview: false } }, async ($, on) => {
  let size = 0
  const toasts: string[] = []
  const filled: string[] = []
  const stats: string[] = []
  const clock = mock.clock(on)
  sessionDirs(on)
  on('fs.stat', (_, e) => {
    stats.push(String((e as { path: string }).path))
    return { value: { kind: 'file', size, mtimeMs: 0, isLink: false } } as never
  })
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined } as never
  })
  on('prompt.fill', (_, e) => {
    filled.push(String((e as { text?: unknown }).text))
    return { isFilled: true } as never
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: started() }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run build', run_in_background: true })
  // Minutes 1 and 2: nothing written yet, two quiet minutes at minute 2.
  await clock.advance(MINUTE)
  expect(toasts).toEqual([])
  await clock.advance(MINUTE)
  expect(toasts).toEqual(['tessera: no output for 2 min from npm run build'])
  // A POSIX engine roots C:/… under its working directory, so the tail is what counts.
  expect(slashed(stats[0]!).endsWith('C:/tmp/claude/C--w/s1/tasks/bg1.output')).toBe(true)
  let ui = await mountBand($)
  expect(await ui.find({ type: 'Text', text: 'A background command has written nothing for 2 min' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'bg1: npm run build' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()
  // The file grows: the row goes; two more quiet minutes: said again.
  size = 100
  await clock.advance(MINUTE)
  ui = await mountBand($)
  expect(await ui.find({ type: 'Button', label: 'ask Claude' } as never)).toBe(undefined)
  await ui.unmount()
  await clock.advance(2 * MINUTE)
  expect(toasts).toHaveLength(2)
  ui = await mountBand($)
  const ask = await ui.find({ type: 'Button', label: 'ask Claude' } as never)
  await ui.press({ key: ask!.key! })
  expect(filled[0]).toContain('bg1')
  expect(filled[0]).not.toContain('.output')
  expect(await ui.find({ type: 'Button', label: 'ask Claude' } as never)).toBe(undefined)
  await clock.advance(10 * MINUTE)
  expect(toasts).toHaveLength(2)
})

test("the task's own notification takes the row down, even after a reload forgot the task", { options: { language: 'en', backgroundQuietMinutes: 1, carryOver: false, pastePreview: false } }, async ($, on) => {
  const clock = mock.clock(on)
  sessionDirs(on)
  on('fs.stat', () => ({ value: { kind: 'file', size: 0, mtimeMs: 0, isLink: false } }) as never)
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', { tool: 'PowerShell' as never }, () => ({ result: started('ps1') }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'PowerShell', command: 'Start-Sleep 999', run_in_background: true } as never)
  await clock.advance(MINUTE)
  const ui = await mountBand($)
  expect(await ui.find({ type: 'Button', label: 'ignore' } as never)).toBeDefined()
  await ui.unmount()
  await $.prompt.submit({ text: '<task-notification>\n<task-id>ps1</task-id>\n<status>completed</status>\n</task-notification>', origin: { kind: 'task-notification' }, wait: false } as never)
  const after = await mountBand($)
  expect(await after.find({ type: 'Button', label: 'ignore' } as never)).toBe(undefined)
})

test("a foreground command, and a subagent's command that ends with its answer, are not watched", { options: { backgroundQuietMinutes: 1, carryOver: false, pastePreview: false } }, async ($, on) => {
  const clock = mock.clock(on)
  sessionDirs(on)
  let stats = 0
  on('fs.stat', () => {
    stats++
    return { value: { kind: 'file', size: 0, mtimeMs: 0, isLink: false } } as never
  })
  on('tool.call', { tool: 'Bash' }, (_, e) => ({ result: e.run_in_background ? started('sub', { backgroundEndsWithFinalResponse: true }) : { stdout: 'done\n', stderr: '', interrupted: false } }) as never)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'echo done' })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true, agentId: 'a1' } as never)
  await clock.advance(5 * MINUTE)
  expect(stats).toBe(0)
})
