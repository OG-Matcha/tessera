import { inflateSync } from './vendor/inflate.js'

const u16 = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8)
const u32 = (b: Uint8Array, i: number) => (u16(b, i) | (u16(b, i + 2) << 16)) >>> 0
const utf8 = new TextDecoder()

// The entries of a zip archive by name, inflated on first read; null when the bytes are no zip.
export function unzip(bytes: Uint8Array): Map<string, () => Uint8Array> | null {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) return null
  const entries = new Map<string, () => Uint8Array>()
  let at = u32(bytes, end + 16)
  for (let n = u16(bytes, end + 10); n > 0 && u32(bytes, at) === 0x02014b50; n--) {
    const method = u16(bytes, at + 10)
    const size = u32(bytes, at + 20)
    const nameLength = u16(bytes, at + 28)
    const local = u32(bytes, at + 42)
    const name = utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
    const raw = bytes.subarray(start, start + size)
    entries.set(name, () => (method === 8 ? inflateSync(raw) : raw))
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32)
  }
  return entries
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m)))
const runs = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map(m => unescape(m[1] ?? ''))
const text = (zip: Map<string, () => Uint8Array>, name: string) => {
  const entry = zip.get(name)
  return entry ? utf8.decode(entry()) : ''
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const table = (rows: string[][]) => {
  const width = Math.max(1, ...rows.map(r => r.length))
  const pad = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill('')].map(cell).join(' | ')} |`
  return [pad(rows[0] ?? []), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(pad)].join('\n')
}

export function docx(zip: Map<string, () => Uint8Array>, limit: number): string {
  const paragraphs = text(zip, 'word/document.xml')
    .split('</w:p>')
    .map(p => runs(p, 'w:t').join(''))
    .filter(p => p.trim() !== '')
  return [...paragraphs.slice(0, limit), ...(paragraphs.length > limit ? [`… ${paragraphs.length - limit} more`] : [])].join('\n\n')
}

const column = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

export function xlsx(zip: Map<string, () => Uint8Array>, limit: number): string {
  const sheets = runs(text(zip, 'xl/workbook.xml').replace(/<sheet [^>]*name="([^"]*)"[^>]*\/>/g, '<n>$1</n>'), 'n')
  const shared = text(zip, 'xl/sharedStrings.xml')
    .split('</si>')
    .map(si => runs(si, 't').join(''))
  const rows = text(zip, 'xl/worksheets/sheet1.xml')
    .split('</row>')
    .slice(0, limit)
    .map(row => {
      const out: string[] = []
      for (const c of row.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:.*?<v>([^<]*)<\/v>|.*?<t[^>]*>([^<]*)<\/t>)?/g)) {
        const value = /t="s"/.test(c[2] ?? '') ? (shared[Number(c[3])] ?? '') : unescape(c[3] ?? c[4] ?? '')
        out[column(c[1] ?? 'A')] = value
      }
      return Array.from(out, v => v ?? '')
    })
    .filter(r => r.some(v => v !== ''))
  return [`Sheets: ${sheets.join(', ')}`, rows.length > 0 ? table(rows) : ''].filter(Boolean).join('\n\n')
}

export function pptx(zip: Map<string, () => Uint8Array>): string {
  const slides = [...zip.keys()]
    .map(name => /^ppt\/slides\/slide(\d+)\.xml$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  return slides.map(m => `${m[1]}. ${runs(text(zip, m[0]), 'a:t').find(t => t.trim() !== '') ?? '—'}`).join('\n')
}

// RFC 4180 rows: quoted fields may hold commas, doubled quotes and line breaks.
export function csv(source: string, limit: number): string {
  const rows: string[][] = [[]]
  let field = ''
  let quoted = false
  for (let i = 0; i < source.length && rows.length <= limit; i++) {
    const c = source[i]
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') (field += '"'), i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') rows[rows.length - 1]?.push(field), (field = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++
      rows[rows.length - 1]?.push(field)
      field = ''
      rows.push([])
    } else field += c
  }
  if (field !== '' || (rows[rows.length - 1]?.length ?? 0) > 0) rows[rows.length - 1]?.push(field)
  return table(rows.filter(r => r.length > 0).slice(0, limit))
}

const EXT = (path: string) => /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase() ?? ''

// A Markdown summary of a document for /tessera peek, or null for a kind it does not read.
export function peek(path: string, bytes: Uint8Array, limit = 40): string | null {
  const kind = EXT(path)
  if (kind === 'md' || kind === 'markdown' || kind === 'txt') return utf8.decode(bytes).split('\n').slice(0, limit * 3).join('\n')
  if (kind === 'csv') return csv(utf8.decode(bytes), limit)
  if (kind === 'json') return `\`\`\`json\n${utf8.decode(bytes).split('\n').slice(0, limit * 2).join('\n')}\n\`\`\``
  const zip = kind === 'docx' || kind === 'xlsx' || kind === 'pptx' ? unzip(bytes) : null
  if (zip === null) return null
  return kind === 'docx' ? docx(zip, limit) : kind === 'xlsx' ? xlsx(zip, limit) : pptx(zip)
}
