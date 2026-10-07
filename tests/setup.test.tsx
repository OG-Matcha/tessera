import { expect, test } from 'claude-code/testing'

const setup = { plugin: 'tessera', surface: 'terminal' as const, component: 'Pane' as const, requestId: 'tessera-setup', props: { title: 'tessera', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { top: 0, bodyRows: 30 } }, viewport: { columns: 60, rows: 30 } }

test('setup lists every feature and a press writes its option', { options: { language: 'en' } }, async ($, on) => {
  const writes: { key: string; value: unknown }[] = []
  on('config.set', (_, e) => {
    writes.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  const ui = await $.ui.mount(setup as never)
  expect(await ui.find({ type: 'Text', text: 'tessera features' })).toBeDefined()
  const inbox = await ui.find({ type: 'Button', key: 'toggle-feedbackInbox' } as never)
  expect(inbox?.props.label).toBe('☐ Client feedback inbox')
  await ui.press(inbox as never)
  expect(writes).toEqual([{ key: 'tessera.feedbackInbox', value: true }])
})

test('with paste previews off, tessera does not hook the band above the prompt', { options: { pastePreview: false } }, async $ => {
  const failure = await $.ui
    .mount({ plugin: 'tessera', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, availableRows: 20 } } as never)
    .then(() => '', (error: Error) => error.message)
  expect(failure).toContain('no implementation for ui.render')
})
