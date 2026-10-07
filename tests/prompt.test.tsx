import { expect, test } from 'claude-code/testing'

import { roughTokens } from '../hooks/render'

const PROMPT = 'You are a release reviewer.\n\nCheck the diff for breaking API changes and list each with its file.'
const reply = `Here is the prompt for the reviewer agent:\n\n\`\`\`prompt\n${PROMPT}\n\`\`\`\n\nPaste it into the agent.`

test('a prompt block draws as a card with its size and a copy button', async $ => {
  const ui = await $.ui.mount({ plugin: 'tessera', surface: 'terminal', component: 'AssistantMessage', props: { text: reply, isFirstOfReply: true }, viewport: { columns: 100, rows: 40 } })
  expect(await ui.find({ type: 'Text', text: /^prompt · ≈\d+ tokens$/ })).toBeDefined()
  expect((await ui.find({ type: 'Button' }))?.props.label).toBe('⧉ copy prompt')
  expect(await ui.find({ type: 'Text', text: 'You are a release reviewer.' })).toBeDefined()
})

test('/tessera copy prompt copies the card verbatim', async ($, on) => {
  const copied: string[] = []
  on('session.messages', () => ({ value: [{ role: 'assistant', text: reply, toolUses: [] }] }) as never)
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  const result = await $.command.run({ command: 'tessera', args: 'copy prompt', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(copied).toEqual([PROMPT])
  expect(result.text).toBe('Copied the prompt.')
})

test('the token estimate counts CJK characters one each and Latin text by four', () => {
  expect(roughTokens('abcdefgh')).toBe(2)
  expect(roughTokens('請檢查這份差異')).toBe(7)
})
