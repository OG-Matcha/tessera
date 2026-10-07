import { expect, test } from 'claude-code/testing'

const LOG = '22:55 Lin 首頁的預約按鈕按了沒有反應\n22:57 Lin 表單送出後頁面一片空白'
const composer = { kind: 'composer' } as const

test('with the inbox off, a pasted chat log adds nothing', { options: { feedbackInbox: false, diagramHints: false } }, async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }) as never)
  const result = (await $.prompt.submit({ text: LOG, origin: composer } as never)) as { context?: string[] }
  expect(result.context ?? []).toEqual([])
})

test('with the inbox on, a pasted log is filed, a repeat of a fixed item is flagged, and the model can mark fixes', { options: { feedbackInbox: true, diagramHints: false } }, async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('env.get', () => ({ value: undefined }))
  on('session.repo', () => ({ value: { root: '/w/app', remote: null } }) as never)
  on('ui.toast', () => ({ value: undefined }))
  const seen: string[][] = []
  on('prompt.submit', (_, e) => {
    seen.push([...(e.context ?? [])])
    return { text: e.text } as never
  })
  await $.prompt.submit({ text: LOG, origin: composer } as never)
  expect(seen[0]?.join('\n')).toContain('filed #1, #2')

  const marked = await $.tool.call({ tool: 'mcp__tessera__inbox_fixed', ids: [1], commit: 'abc123' } as never)
  expect(JSON.stringify(marked)).toContain('abc123')

  await $.prompt.submit({ text: '10:02 Lin 預約按鈕按了還是沒有反應\n10:03 Lin 價格顯示錯誤', origin: composer } as never)
  expect(seen[1]?.join('\n')).toContain('#3')
  expect(seen[1]?.join('\n')).toContain('resembles #1')
})
