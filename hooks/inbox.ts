type ChatLine = { at: string; who: string; text: string }

export type InboxItem = ChatLine & { id: number; status: 'open' | 'fixed'; fixedBy?: string; reopenedFrom?: number }

// "22:55 Amy 首頁按鈕沒反應", "[09:01] 王小明：表單送不出去", "14:03:12 Amy: login fails"
const LINE = /^\s*\[?(\d{1,2}:\d{2})(?::\d{2})?\]?\s+([^\s:：\]]{1,20})(?:\s*[:：]\s*|\s+)(\S.{2,})$/

// A paste counts as a chat log only when at least two of its lines look like timestamped messages.
export function parseChat(text: string): ChatLine[] {
  const lines = text.split(/\r?\n/).flatMap(l => {
    const m = LINE.exec(l)
    return m ? [{ at: m[1] ?? '', who: m[2] ?? '', text: (m[3] ?? '').trim() }] : []
  })
  return lines.length >= 2 ? lines : []
}

const grams = (s: string) => {
  const chars = [...s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')]
  const out = new Set<string>()
  for (let i = 0; i + 1 < chars.length; i++) out.add(`${chars[i]}${chars[i + 1]}`)
  return out
}

// Dice coefficient over character bigrams, which treats Chinese and English text alike.
export function similarity(a: string, b: string): number {
  const x = grams(a)
  const y = grams(b)
  if (x.size === 0 || y.size === 0) return 0
  let both = 0
  for (const g of x) if (y.has(g)) both++
  return (2 * both) / (x.size + y.size)
}

const SIMILAR = 0.55

type Intake = { items: InboxItem[]; added: InboxItem[]; regressions: { item: InboxItem; like: InboxItem }[] }

export function intake(items: InboxItem[], lines: ChatLine[]): Intake {
  const next = [...items]
  const added: InboxItem[] = []
  const regressions: Intake['regressions'] = []
  let id = items.reduce((m, i) => Math.max(m, i.id), 0)
  for (const line of lines) {
    if (next.some(i => i.status === 'open' && i.text === line.text)) continue
    const like = next
      .filter(i => i.status === 'fixed')
      .map(i => ({ i, score: similarity(i.text, line.text) }))
      .filter(c => c.score >= SIMILAR)
      .sort((a, b) => b.score - a.score)[0]?.i
    const item: InboxItem = { ...line, id: ++id, status: 'open', ...(like ? { reopenedFrom: like.id } : {}) }
    next.push(item)
    added.push(item)
    if (like) regressions.push({ item, like })
  }
  return { items: next, added, regressions }
}

export function markFixed(items: InboxItem[], ids: number[], commit: string): InboxItem[] {
  return items.map(i => (ids.includes(i.id) ? { ...i, status: 'fixed' as const, fixedBy: commit } : i))
}

const clip = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s)

export function intakeNote(result: Intake): string {
  const lines = [`tessera feedback inbox: filed ${result.added.map(i => `#${i.id}`).join(', ')} from the pasted chat log.`]
  for (const { item, like } of result.regressions)
    lines.push(`#${item.id} ("${clip(item.text, 40)}") resembles #${like.id} ("${clip(like.text, 40)}"), marked fixed in ${like.fixedBy ?? 'an earlier change'}: check whether that fix regressed before fixing it again.`)
  lines.push('When you fix items, call the tessera inbox_fixed tool with their numbers and the commit.')
  return lines.join('\n')
}

export function listText(items: InboxItem[], empty: string, headers: readonly string[]): string {
  if (items.length === 0) return empty
  const mark = (i: InboxItem) => (i.status === 'fixed' ? `✓ ${i.fixedBy ?? ''}`.trim() : i.reopenedFrom ? `↺ #${i.reopenedFrom}` : '…')
  return [`| ${headers.join(' | ')} |`, '|---|---|---|---|---|', ...items.slice(-40).map(i => `| ${i.id} | ${i.at} | ${i.who} | ${clip(i.text, 48).replace(/\|/g, '\\|')} | ${mark(i)} |`)].join('\n')
}
