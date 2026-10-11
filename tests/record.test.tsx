import { expect, test } from 'claude-code/testing'

const run = (args: string) => ({ command: 'tessera', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })
const reply = (text: string) => ({ plugin: 'tessera', surface: 'terminal' as const, component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true }, viewport: { columns: 120, rows: 40 } })
const prompt = (text: string) => ({ plugin: 'tessera', surface: 'terminal' as const, component: 'UserMessage' as const, props: { text, origin: { kind: 'composer' } as never, isExpanded: false }, viewport: { columns: 80, rows: 10 } })
const row = (command: string) => ({ plugin: 'tessera', surface: 'terminal' as const, component: 'ToolUse' as const, props: { tool_use_id: 'r1', tool: 'Bash', input: { command }, isRunning: false, isErrored: false, isInterrupted: false } })

// Secret-shaped fixtures are assembled here, so no scanner takes the test for a leak.
const KEY = ['sk-ant-api03', 'AbCdEfGhIjKlMnOpQrStUvWxYz0123'].join('-')
const HEADER = ['Bearer', 'abcdefghijklmnopqrstuvwxyz'].join(' ')

test('/tessera record masks keys, emails and phone numbers in replies, prompts and tool rows; record again shows them', { options: { language: 'en' } }, async ($, on) => {
  const status: (string | undefined)[] = []
  on('ui.status', (_, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  expect((await $.command.run(run('record'))).text).toContain('Record mode on')
  expect(status).toEqual(['⏺ tessera record: keys, emails and phone numbers masked on screen'])

  const drawn = await $.ui.mount(reply(`Use \`${KEY}\` and mail ada@example.com or call 0912-345-678.`))
  expect(await drawn.find({ type: 'Text', text: /sk-ant-api03-••••••••/ })).toBeDefined()
  expect(await drawn.find({ type: 'Text', text: /a•••@•••\.com/ })).toBeDefined()
  // The number highlight draws 0912 as its own Text; the masked rest follows it.
  expect(await drawn.find({ type: 'Text', text: /^-•••-•••\.$/ })).toBeDefined()
  expect(await drawn.find({ type: 'Text', text: /ada@example|AbCdEf|345-678/ })).toBeUndefined()
  await drawn.unmount()

  const typed = await $.ui.mount(prompt(`my key is ${KEY}`))
  expect(await typed.find({ type: 'Text', text: /^my key is sk-ant-api03-••••••••$/ })).toBeDefined()
  await typed.unmount()

  const ran = await $.ui.mount(row(`printf "Authorization: ${HEADER}"`))
  expect(await ran.find({ type: 'Text', text: /Bearer ••••••••/ })).toBeDefined()
  expect(await ran.find({ type: 'Text', text: /abcdefghijkl/ })).toBeUndefined()
  await ran.unmount()

  expect((await $.command.run(run('record'))).text).toBe('Record mode off.')
  expect(status).toEqual(['⏺ tessera record: keys, emails and phone numbers masked on screen', undefined])
  const plain = await $.ui.mount(reply('mail ada@example.com'))
  expect(await plain.find({ type: 'Text', text: /ada@example\.com/ })).toBeDefined()
  await plain.unmount()
})

test('a folded diff is masked while recording', { options: { language: 'en' } }, async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  await $.command.run(run('record on'))
  const hunk = { oldStart: 1, oldLines: 13, newStart: 1, newLines: 13, lines: [...Array.from({ length: 13 }, (_, i) => `-mail ada@example.com ${i}`), ...Array.from({ length: 13 }, (_, i) => `+mail bob@example.com ${i}`)] }
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'ToolResult', props: { tool_use_id: 'f1', tool: 'Edit', output: { filePath: '/p/a.txt', structuredPatch: [hunk] }, isErrored: false } })
  expect(await ui.find({ type: 'Text', text: /a•••@•••\.com 0/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ada@example/ })).toBeUndefined()
  await ui.unmount()
  await $.command.run(run('record off'))
})
