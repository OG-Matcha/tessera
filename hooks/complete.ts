import type { Lang } from './i18n'

export type Suggestion = { text: string; label?: string; description?: string }

const SUBCOMMANDS: Record<Lang, [string, string][]> = {
  en: [
    ['setup', 'Pick the features you want on'],
    ['inbox', 'Client feedback inbox; inbox fixed <n…> marks items fixed'],
    ['theme', 'Switch theme on the spot'],
    ['copy', 'Copy the last reply; copy code copies its last code block'],
    ['demo', 'Full showcase of every element and diagram'],
  ],
  'zh-TW': [
    ['setup', '選擇要開啟的功能'],
    ['inbox', '客戶回饋收件匣；inbox fixed <編號…> 標為已修'],
    ['theme', '立即切換主題'],
    ['copy', '複製上一則回覆；copy code 只複製最後一個程式碼區塊'],
    ['demo', '完整示範：每種元素和圖表'],
  ],
}

const SECOND: Record<Lang, Record<string, [string, string][]>> = {
  en: { copy: [['code', 'Only the last code block'], ['prompt', 'The prompt card, verbatim']], inbox: [['fixed', 'Mark items fixed at the current commit: inbox fixed 3 5']] },
  'zh-TW': { copy: [['code', '只複製最後一個程式碼區塊'], ['prompt', '原文複製 prompt 卡片']], inbox: [['fixed', '以目前的 commit 標為已修：inbox fixed 3 5']] },
}

// Rows for the word being typed after /tessera: its subcommands, then theme names or the second word.
export function completions(text: string, start: number, token: string, themes: readonly string[], lang: Lang): Suggestion[] {
  const before = text.slice(0, start).trim().split(/\s+/)
  if (before[0] !== '/tessera' || token.startsWith('/')) return []
  const typed = token.toLowerCase()
  const rows = (pairs: [string, string][]) => pairs.filter(([word]) => word.startsWith(typed)).map(([word, description]) => ({ text: word, description }))
  if (before.length === 1) return rows(SUBCOMMANDS[lang])
  if (before.length === 2 && before[1] === 'theme') return themes.filter(name => name.startsWith(typed)).map(name => ({ text: name }))
  if (before.length === 2) return rows(SECOND[lang][before[1] ?? ''] ?? [])
  return []
}
