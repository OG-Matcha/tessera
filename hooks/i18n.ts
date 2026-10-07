export type Lang = 'en' | 'zh-TW'

const EN = {
  copied: 'Copied',
  copyFailed: 'Copy failed',
  nothingToCopy: 'Nothing to copy yet.',
  noCodeBlock: 'The last reply has no code block.',
  copiedReply: 'Copied the last reply.',
  copiedCode: 'Copied the last code block.',
  unknownTheme: (name: string, themes: string) => `Unknown theme "${name}". Themes: ${themes}`,
  themeFailed: 'Could not switch theme',
  themeSet: (name: string) => `Theme set to ${name}.`,
  commandDescription: 'Switch the tessera theme, copy the last reply, or show the demo',
  original: 'original',
  noPreview: '(no preview)',
}

const ZH: typeof EN = {
  copied: '已複製',
  copyFailed: '複製失敗',
  nothingToCopy: '還沒有可以複製的回覆。',
  noCodeBlock: '上一則回覆沒有程式碼區塊。',
  copiedReply: '已複製上一則回覆。',
  copiedCode: '已複製上一則回覆的最後一個程式碼區塊。',
  unknownTheme: (name, themes) => `沒有「${name}」這個主題。可用主題：${themes}`,
  themeFailed: '無法切換主題',
  themeSet: name => `主題已切換為 ${name}。`,
  commandDescription: '切換 tessera 主題、複製上一則回覆，或顯示示範',
  original: '原圖',
  noPreview: '（無法預覽）',
}

export type Strings = typeof EN
export const STRINGS: Record<Lang, Strings> = { en: EN, 'zh-TW': ZH }

// The first locale hint that names a language decides: any Chinese reads Traditional Chinese.
export function pickLang(option: unknown, hints: (string | undefined)[]): Lang {
  if (option === 'en' || option === 'zh-TW') return option
  const hint = hints.find(h => h !== undefined && h !== '' && h !== 'C' && h !== 'POSIX')
  return hint !== undefined && /^zh|chinese|中文/i.test(hint) ? 'zh-TW' : 'en'
}
