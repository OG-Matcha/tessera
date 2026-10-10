// Claude Code reads and writes files as UTF-8, so an edit to a file in another encoding (Big5, Shift-JIS,
// GBK, EUC-KR, UTF-16) rewrites it with replacement characters where its text was
// (anthropics/claude-code#7134). The bytes are judged before the edit, so the person can convert the file
// first or say the loss is fine.
export type Encoding = 'utf-8' | 'utf-16' | 'other'

// Strict UTF-8: no overlong forms, no surrogates, nothing past U+10FFFF, no stray continuation bytes.
export function encodingOf(bytes: Uint8Array): Encoding {
  const n = bytes.length
  let i = 0
  if (n >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return 'utf-16'
  // NUL is valid UTF-8, but text has none: UTF-16 without a byte-order mark has one in every other byte.
  if (other(bytes) === 'utf-16') return 'utf-16'
  while (i < n) {
    const b = bytes[i]!
    if (b < 0x80) {
      i++
      continue
    }
    let need: number
    let min: number
    if (b >= 0xc2 && b <= 0xdf) (need = 1), (min = 0x80)
    else if (b >= 0xe0 && b <= 0xef) (need = 2), (min = 0x800)
    else if (b >= 0xf0 && b <= 0xf4) (need = 3), (min = 0x10000)
    else return other(bytes)
    let code = b & (0x3f >> need)
    for (let k = 1; k <= need; k++) {
      const c = bytes[i + k]
      if (c === undefined || (c & 0xc0) !== 0x80) return other(bytes)
      code = (code << 6) | (c & 0x3f)
    }
    if (code < min || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return other(bytes)
    i += need + 1
  }
  return 'utf-8'
}

// UTF-16 without a byte-order mark shows as a NUL in every other byte of Latin text.
function other(bytes: Uint8Array): Encoding {
  const head = bytes.subarray(0, 512)
  let nul = 0
  for (const b of head) if (b === 0) nul++
  return head.length > 1 && nul * 3 >= head.length ? 'utf-16' : 'other'
}

// What an edit may do to the file, for the reminder.
export const encodingNote = (encoding: Encoding): string =>
  encoding === 'utf-16'
    ? 'it is UTF-16, and Claude Code reads and writes files as UTF-8, so the edit would garble it'
    : 'it is not UTF-8 (Big5, Shift-JIS, GBK, EUC-KR or another code page), and Claude Code reads and writes files as UTF-8, so the edit would replace its text with � characters (anthropics/claude-code#7134)'
