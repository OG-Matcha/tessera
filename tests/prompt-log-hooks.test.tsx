import type { On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

type Engine = Parameters<TestBody>[0]

const OPTIONS = { language: 'en', carryOver: false, pastePreview: false, backgroundWatch: false, cacheClock: false } as const
// What Claude Code 2.1.309 hands prompt.submit, and draws in the row, for a paste with words typed after it.
const PASTED = '<pasted_content id="71cb">\nlog line 1\nlog line 2\n</pasted_content>\n what does this error mean'
const presentation = { isFullscreen: true, columns: 160 }

// The engine beneath the plugins: prompts enter, commands print, panes open. The test kit of Claude Code
// 2.1.309 has no stand-in for scrolling the transcript (only a pane or the band), so a jump here takes the
// path of a scroll that failed; scripts/e2e checks the jump itself in a real session.
function engine(on: On, submit: (text: string) => object = text => ({ text })) {
  const seen = { opened: [] as string[], toasts: [] as string[], filled: [] as string[], clock: mock.clock(on) }
  on('env.get', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: 'C:/w' }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('prompt.submit', (_, e) => submit(e.text) as never)
  on('command.run', () => ({ text: 'done' }) as never)
  on('ui.open', (_, e) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.focus', () => ({ value: {} }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', (_, e) => {
    seen.toasts.push(String((e as { text?: unknown }).text ?? e))
    return { value: undefined } as never
  })
  on('prompt.fill', (_, e) => {
    seen.filled.push(String((e as { text?: unknown }).text))
    return { isFilled: true } as never
  })
  on('session.end', (_, e) => ({ sessionId: e.sessionId }) as never)
  on('turn.complete', (_, e) => ({ text: (e as { answer: string }).answer }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return seen
}

const typed = (text: string) => ({ text, origin: { kind: 'composer' as const }, wait: false })

// A transcript row drawing, as the engine draws the person's prompt once it is stored.
async function drawRow($: Engine, requestId: string, text: string, onScreen: unknown = null) {
  const row = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'UserMessage', requestId, props: { text, origin: { kind: 'composer' }, isExpanded: false, onScreen }, viewport: { columns: 100, rows: 40 } } as never)
  return row
}

const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'Pane', requestId: 'tessera-log', props: { title: 'log', isFocused: true, bodyColumns: 46, placement: 'dock', scroll: { top: 0, bodyRows: 30 } }, viewport: { columns: 46, rows: 30 } } as never)

type Mounted = Awaited<ReturnType<typeof mountPane>>
const press = async (pane: Mounted, key: string) => pane.press((await pane.find({ type: 'Button', key }))! as never)

const openLog = ($: Engine) => $.command.run({ command: 'tessera', args: 'log', origin: { kind: 'composer' }, presentation })

test('typed prompts, a paste and a command are listed newest first, and a jump that cannot scroll says so and offers f', { options: OPTIONS }, async ($, on) => {
  const seen = engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('Reply with exactly one word: alpha') as never)
  await (await drawRow($, 'placeholder', 'Reply with exactly one word: alpha')).unmount()
  await (await drawRow($, 'row-a', 'Reply with exactly one word: alpha')).unmount()
  await $.prompt.submit(typed(PASTED) as never)
  await (await drawRow($, 'row-p', PASTED)).unmount()
  await $.command.run({ command: 'context', args: '', origin: { kind: 'composer' }, presentation })
  const out = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'CommandOutput', requestId: 'out-c', props: { command: 'context', args: '', text: 'Context Usage', isErrored: false }, viewport: { columns: 100, rows: 40 } } as never)
  await out.unmount()

  expect((await openLog($)).text).toBe('Prompt log opened.')
  expect(seen.opened).toEqual(['tessera-log'])
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: 'Prompt log · 3 prompts' })).toBeDefined()
  const rows = (await pane.findAll({ type: 'Button' })).map(b => b.props.key).filter(k => String(k).startsWith('log-') && /\d$/.test(String(k)))
  expect(rows).toEqual(['log-3', 'log-2', 'log-1'])
  expect(await pane.find({ type: 'Button', text: /^3 \d\d:\d\d \/ \/context$/ })).toBeDefined()
  // The pane is 46 columns: the paste's text, unwrapped, is cut to the row.
  expect(await pane.find({ type: 'Button', text: /^2 \d\d:\d\d ⎘ log line 1 log line 2 what does t…$/ })).toBeDefined()

  await press(pane, 'log-1')
  expect(seen.toasts).toEqual(['Cannot jump to #1 (no implementation for ui.scroll); press f to put it back in the prompt'])
  // No jump landed, so no row is lit.
  const row = await drawRow($, 'row-a', 'Reply with exactly one word: alpha')
  expect((await row.find({ type: 'Box' }))?.props.backgroundColor).toBe(undefined)
  await row.unmount()
  await pane.unmount()
})

// The lit row after a jump is kept in the module, which the kit loads apart from this file, and the kit
// cannot land a jump on a transcript row: scripts/e2e checks the light.
test('the buttons name only what they do; the engine adds their key', { options: OPTIONS }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('jump here') as never)
  await openLog($)
  const pane = await mountPane($)
  expect((await pane.findAll({ type: 'Button' })).filter(b => /^log-(up|down|fill)$/.test(String(b.props.key))).map(b => b.props.label)).toEqual(['↑', '↓', 'put back'])
  await pane.unmount()
})

test('f puts the selected prompt back in the prompt whole, its paste as plain text', { options: OPTIONS }, async ($, on) => {
  const seen = engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed(PASTED) as never)
  await (await drawRow($, 'row-p', PASTED)).unmount()
  await openLog($)
  const pane = await mountPane($)
  await press(pane, 'log-fill')
  expect(seen.filled).toEqual(['log line 1\nlog line 2\n what does this error mean'])
  await pane.unmount()
})

test('a prompt still waiting for its row, the placeholder aside, says it has none to jump to; /tessera log is not listed', { options: OPTIONS }, async ($, on) => {
  const seen = engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('Reply with exactly one word: beta') as never)
  await (await drawRow($, 'placeholder', 'Reply with exactly one word: beta')).unmount()
  await openLog($)
  await openLog($)
  const pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: 'Prompt log · 1 prompt' })).toBeDefined()
  await press(pane, 'log-1')
  expect(seen.toasts).toEqual(['#1 drew no row to jump to; press f to put it back in the prompt'])
  await pane.unmount()
})

// The focus ring moving with Tab is a person's key, which the kit does not raise: scripts/e2e presses it.
test('the selected prompt shows its reply; j and k move the selection', { options: OPTIONS }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('first') as never)
  await $.turn.complete({ answer: '\n第一則的回覆\n第二行', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await $.prompt.submit(typed('second') as never)
  await $.turn.complete({ answer: 'second reply', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as never)
  await openLog($)
  let pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /^#2 · \d\d:\d\d · prompt$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '└ second reply' })).toBeDefined()
  await press(pane, 'log-down')
  await pane.unmount()
  pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: '└ 第一則的回覆' })).toBeDefined()
  await press(pane, 'log-up')
  await pane.unmount()
  pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: '└ second reply' })).toBeDefined()
  await pane.unmount()
})

test('the prompts on screen carry a green dot', { options: OPTIONS }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('on screen') as never)
  await (await drawRow($, 'row-1', 'on screen', { first: 0, last: 2, of: 3 })).unmount()
  await $.prompt.submit(typed('scrolled away') as never)
  await (await drawRow($, 'row-2', 'scrolled away', null)).unmount()
  await openLog($)
  const pane = await mountPane($)
  // #1 is on screen, #2 scrolled away: one dot, in the theme's number green.
  const dots = await pane.findAll({ type: 'Text', text: '●' })
  expect(dots).toHaveLength(1)
  expect(dots[0]!.props.color).toBe('#a6e3a1')
  await pane.unmount()
})

test('a prompt the engine drops leaves the log, and /clear empties it', { options: OPTIONS }, async ($, on) => {
  let drop = true
  engine(on, text => (drop ? { drop: 'masked' } : { text }))
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('a prompt the engine drops') as never)
  await openLog($)
  let pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: 'No prompts in this session yet.' })).toBeDefined()
  await pane.unmount()
  drop = false
  await $.prompt.submit(typed('kept') as never)
  pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: 'Prompt log · 1 prompt' })).toBeDefined()
  await pane.unmount()
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as never)
  pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: 'No prompts in this session yet.' })).toBeDefined()
  await pane.unmount()
})

test('with promptLog off, /tessera log says how to turn it on and nothing is kept', { options: { ...OPTIONS, promptLog: false } }, async ($, on) => {
  const seen = engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('hello') as never)
  expect((await openLog($)).text).toBe('The prompt log is off. Turn on promptLog in /tessera setup.')
  expect(seen.opened).toEqual([])
})

test('while /tessera record is on, the pane masks emails and keys in prompts and replies, as all tessera draws', { options: OPTIONS }, async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('mail the report to ada@example.com') as never)
  await $.turn.complete({ answer: 'Sent to ada@example.com', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await openLog($)
  let pane = await mountPane($)
  expect(await pane.find({ type: 'Text', text: /ada@example\.com/ })).toBeDefined()
  await pane.unmount()
  await $.command.run({ command: 'tessera', args: 'record on', origin: { kind: 'composer' }, presentation })
  pane = await mountPane($)
  expect(await pane.find({ text: /ada@example/ })).toBeUndefined()
  expect(await pane.find({ type: 'Button', text: /mail the report to a•••@•••\.com$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'mail the report to a•••@•••.com' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '└ Sent to a•••@•••.com' })).toBeDefined()
  await pane.unmount()
  await $.command.run({ command: 'tessera', args: 'record off', origin: { kind: 'composer' }, presentation })
})
