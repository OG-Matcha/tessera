export type Term = { use: string; avoid: string[] }

// A glossary is any markdown table in CLAUDE.md with a column for the term to use and one for the
// wordings it replaces, under headers such as | Use | Avoid | or | 用語 | 避免 |.
const USE = /^(use|preferred|term|用語|用|寫法|正確寫法)$/i
const AVOID = /^(avoid|not|instead of|don'?t use|避免|不用|勿用|別用)$/i

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(c => c.trim().replace(/^[`「"']+|[`」"']+$/g, ''))

export function parseGlossary(markdown: string): Term[] {
  const terms: Term[] = []
  let header: string[] | undefined
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) {
      header = undefined
      continue
    }
    const row = cells(line)
    if (header === undefined) {
      header = row
      continue
    }
    if (row.every(c => /^:?-+:?$/.test(c))) continue
    const use = row[header.findIndex(h => USE.test(h))]
    const avoid = row[header.findIndex(h => AVOID.test(h))]
    if (!use || !avoid) continue
    terms.push({ use, avoid: avoid.split(/[,，、/;；]/).map(a => a.trim().replace(/^[`「"']+|[`」"']+$/g, '')).filter(Boolean) })
  }
  return terms
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const contains = (text: string, word: string) =>
  /^[\x20-\x7e]+$/.test(word) ? new RegExp(`(^|[^A-Za-z0-9_])${escape(word)}($|[^A-Za-z0-9_])`, 'i').test(text) : text.includes(word)

// Avoided wordings a write would bring into a file, as "avoided→term" pairs; a wording the file already
// uses is taken as deliberate.
export function glossaryHits(terms: Term[], texts: string[], existing: string): string[] {
  const text = texts.join('\n')
  return terms.flatMap(t => t.avoid.filter(a => contains(text, a) && !contains(existing, a)).map(a => `${a}→${t.use}`))
}
