import HANS from './vendor/hans.js'

// Characters that only Simplified Chinese uses, each with its Taiwan Traditional form.
const TRADITIONAL = new Map(HANS.split('|').map(pair => [...pair] as [string, string]))

// Files meant to hold Simplified text: zh-CN, zh-SG and zh-Hans locales.
const SIMPLIFIED_FILE = /zh[-_](cn|sg|my|hans)|hans|\bchs\b/i
// Japanese shares many Simplified-looking forms (点, 画, 号), so lines with kana are not checked.
const KANA = /[぀-ヿ]/

export function simplifiedChars(text: string): string[] {
  const found = new Set<string>()
  for (const ch of text) if (TRADITIONAL.has(ch)) found.add(ch)
  return [...found]
}

// Simplified characters a write would put into a file that is otherwise Traditional, as "简→簡" pairs.
// A file already holding Simplified text, or named for a Simplified locale, is left alone.
export function simplifiedWrite(path: string, texts: string[], existing: string): string[] {
  if (SIMPLIFIED_FILE.test(path) || simplifiedChars(existing).length > 0) return []
  const chinese = texts.flatMap(t => t.split('\n')).filter(line => !KANA.test(line))
  return simplifiedChars(chinese.join('\n')).map(ch => `${ch}→${TRADITIONAL.get(ch)}`)
}
