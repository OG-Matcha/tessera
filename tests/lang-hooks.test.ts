import { expect, test } from 'claude-code/testing'

const run = { command: 'tessera', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

test('with no Chinese setting or locale, a prompt written in Chinese switches tessera to Traditional Chinese', { options: { diagramHints: false } }, async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  expect((await $.command.run(run)).text).toContain('## Commands')
  await $.prompt.submit({ text: '幫我看一下這個錯誤', origin: { kind: 'composer' } } as never)
  expect((await $.command.run(run)).text).toContain('## 指令')
})

test('an explicit English setting stays English', { options: { language: 'en', diagramHints: false } }, async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  await $.prompt.submit({ text: '幫我看一下這個錯誤', origin: { kind: 'composer' } } as never)
  expect((await $.command.run(run)).text).toContain('## Commands')
})

test('the reply-language note goes once, and again only when the language changes', { options: { diagramHints: false } }, async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  const seen: string[][] = []
  on('prompt.submit', (_, e) => {
    seen.push([...(e.context ?? [])])
    return { text: e.text } as never
  })
  await $.prompt.submit({ text: '幫我看這個錯誤\n```\nTypeError: x is undefined\n```', origin: { kind: 'composer' } } as never)
  await $.prompt.submit({ text: '還有這個也一起修', origin: { kind: 'composer' } } as never)
  await $.prompt.submit({ text: 'このエラーを直してください', origin: { kind: 'composer' } } as never)
  expect(seen[0]?.join('\n')).toContain('Reply in Traditional Chinese')
  expect(seen[1]).toEqual([])
  expect(seen[2]?.join('\n')).toContain('Reply in Japanese')
})

test('the diagram hint goes with the first prompt only', { options: { replyLanguage: 'off' } }, async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  const seen: string[][] = []
  on('prompt.submit', (_, e) => {
    seen.push([...(e.context ?? [])])
    return { text: e.text } as never
  })
  await $.prompt.submit({ text: 'draw the flow', origin: { kind: 'composer' } } as never)
  await $.prompt.submit({ text: 'and the next one', origin: { kind: 'composer' } } as never)
  expect(seen[0]?.join('\n')).toContain('```prompt')
  expect(seen[1]).toEqual([])
})

test('replyLanguage off adds nothing', { options: { diagramHints: false, replyLanguage: 'off' } }, async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  const seen: string[][] = []
  on('prompt.submit', (_, e) => {
    seen.push([...(e.context ?? [])])
    return { text: e.text } as never
  })
  await $.prompt.submit({ text: '幫我看這個錯誤', origin: { kind: 'composer' } } as never)
  expect(seen[0]).toEqual([])
})
