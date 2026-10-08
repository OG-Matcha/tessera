import { expect, test } from 'claude-code/testing'

const write = { tool: 'Write', file_path: 'C:/p/README.md', content: '# 說明\n\n这个功能会自动更新。' } as never

test('a Simplified write is refused with the Taiwan forms, and the same call sent again goes through', { options: { guardSimplified: 'on' } }, async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', () => ({ value: '' }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  const first = await $.tool.call(write)
  expect(first.deny).toContain('这→這')
  expect(first.deny).toContain('会→會')
  const again = await $.tool.call(write)
  expect(again.deny).toBe(undefined)
})

test('auto guards only while the person writes Traditional Chinese', async ($, on) => {
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', () => ({ value: undefined }))
  on('fs.read', () => ({ value: '' }) as never)
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  await $.prompt.submit({ text: 'update the readme please', origin: { kind: 'composer' } } as never)
  expect((await $.tool.call(write)).deny).toBe(undefined)
  await $.prompt.submit({ text: '幫我更新說明文件', origin: { kind: 'composer' } } as never)
  expect((await $.tool.call(write)).deny).toContain('Simplified')
})

test('a file that already holds Simplified text is left alone', { options: { guardSimplified: 'on' } }, async ($, on) => {
  on('fs.read', () => ({ value: '这是原本的简体文件' }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  expect((await $.tool.call(write)).deny).toBe(undefined)
})

test('off adds nothing', { options: { guardSimplified: 'off' } }, async ($, on) => {
  on('fs.read', () => ({ value: '' }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: 'written' }) as never)
  expect((await $.tool.call(write)).deny).toBe(undefined)
})
