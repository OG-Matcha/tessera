import { expect, test } from 'claude-code/testing'

import { encodingNote, encodingOf } from '../hooks/encoding'

const utf8 = (text: string) => new TextEncoder().encode(text)

test('UTF-8 text, with or without a byte-order mark, is UTF-8', () => {
  expect(encodingOf(utf8('plain ascii\n'))).toBe('utf-8')
  expect(encodingOf(utf8('中文、日本語、한국어、emoji 😀\n'))).toBe('utf-8')
  expect(encodingOf(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('bom')]))).toBe('utf-8')
  expect(encodingOf(new Uint8Array())).toBe('utf-8')
})

test('a code page file is other, and strict rules catch overlongs, surrogates and stray bytes', () => {
  // 中文 in Big5, then a newline.
  expect(encodingOf(new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5, 0x0a]))).toBe('other')
  // 日本語 in Shift-JIS.
  expect(encodingOf(new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]))).toBe('other')
  expect(encodingOf(new Uint8Array([0xc0, 0x80]))).toBe('other')
  expect(encodingOf(new Uint8Array([0xed, 0xa0, 0x80]))).toBe('other')
  expect(encodingOf(new Uint8Array([0x80, 0x41]))).toBe('other')
  expect(encodingOf(new Uint8Array([0xe4, 0xb8]))).toBe('other')
})

test('UTF-16 is told by its byte-order mark or its NULs', () => {
  expect(encodingOf(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]))).toBe('utf-16')
  expect(encodingOf(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))).toBe('utf-16')
  const latin = 'Set-Location C:\\w\nGet-ChildItem\n'
  expect(encodingOf(new Uint8Array([...latin].flatMap(ch => [ch.charCodeAt(0), 0])))).toBe('utf-16')
  expect(encodingNote('utf-16')).toContain('UTF-16')
  expect(encodingNote('other')).toContain('#7134')
})
