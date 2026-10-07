export type Voice = 'zh-Hant' | 'zh-Hans' | 'ja' | 'ko' | 'en'

export const VOICE_NAMES: Record<Voice, string> = {
  'zh-Hant': 'Traditional Chinese (繁體中文)',
  'zh-Hans': 'Simplified Chinese (简体中文)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  en: 'English',
}

// The person's own words: a prompt less what they pasted or quoted (code, logs, chat lines, links, paths).
export function ownWords(prompt: string): string {
  return prompt
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/"""[\s\S]*?("""|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\[(Pasted text|Image)[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(?:[A-Za-z]:)?[\\/][^\s，。、]+/g, ' ')
    .split('\n')
    .filter(line => {
      const l = line.trim()
      if (l.startsWith('>')) return false
      if (/^\[?\d{1,2}:\d{2}(:\d{2})?\]?\s/.test(l)) return false
      if (/^(at |\s*File "|Traceback|Error:|\w+Error\b|WARN|INFO|DEBUG|\d{4}-\d{2}-\d{2}[ T])/.test(l)) return false
      const symbols = (l.match(/[{}[\]();=<>|\\/$#@*_]/g) ?? []).length
      return symbols < l.length * 0.15
    })
    .join('\n')
}

const TRAD = /[們這個說時會為發對沒過還進動開關問題實現應該讓從麼與後體點樣門裡請將當覺樣頁]/g
const SIMP = /[们这个说时会为发对没过还进动开关问题实现应该让从么与后体点样门里请将当觉页]/g

// The language of the person's own words, or undefined when they hold too little to tell.
export function voiceOf(prompt: string): Voice | undefined {
  const own = ownWords(prompt)
  const han = (own.match(/\p{Script=Han}/gu) ?? []).length
  const kana = (own.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length
  const hangul = (own.match(/\p{Script=Hangul}/gu) ?? []).length
  const latinWords = (own.match(/[A-Za-z]{2,}/g) ?? []).length
  const cjk = han + kana + hangul
  if (cjk < 2 && latinWords < 3) return undefined
  if (cjk >= latinWords) {
    if (hangul > 0 && hangul >= kana) return 'ko'
    if (kana > 0) return 'ja'
    return (own.match(SIMP) ?? []).length > (own.match(TRAD) ?? []).length ? 'zh-Hans' : 'zh-Hant'
  }
  return 'en'
}

export const replyNote = (voice: Voice) =>
  `The person writes in ${VOICE_NAMES[voice]}. Reply in ${VOICE_NAMES[voice]}, even when the pasted logs, code or documents are in another language; keep code, commands, identifiers and quoted text as they are.`
