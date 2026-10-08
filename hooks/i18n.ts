export type Lang = 'en' | 'zh-TW'

const EN = {
  copied: 'Copied',
  copyFailed: 'Copy failed',
  nothingToCopy: 'Nothing to copy yet.',
  noCodeBlock: 'The last reply has no code block.',
  noPromptBlock: 'The last reply has no prompt card.',
  copiedPrompt: 'Copied the prompt.',
  setupTitle: 'tessera features',
  setupHint: 'tessera: /tessera setup picks the features you want on.',
  setupOpened: 'tessera setup opened.',
  closePane: '✕ close',
  resumeScheduled: (time: string) => `Usage limit reached: tessera will continue at ${time}. Typing anything cancels it.`,
  resumePrompt: 'The usage limit has reset. Continue from where you stopped.',
  peekUsage: 'Usage: /tessera peek <file> or @file (.md, .csv, .json, .docx, .xlsx, .pptx)',
  peekUnreadable: (path: string) => `Cannot read ${path} (missing, or over 4 MiB).`,
  peekUnknown: (path: string) => `tessera does not preview this kind of file: ${path}`,
  pastedText: (n: number, lines: number) => `Pasted text #${n} · ${lines} lines`,
  carryTitle: (n: number) => `${n} unfinished from your last session here`,
  carryContinue: 'continue',
  carryDismiss: 'dismiss',
  carryPrompt: (items: string[]) => `Unfinished tasks from the last session in this project:\n${items.map(i => `- ${i}`).join('\n')}\nCheck which still apply and carry on with them.`,
  copiedReply: 'Copied the last reply.',
  copiedCode: 'Copied the last code block.',
  unknownTheme: (name: string, themes: string) => `Unknown theme "${name}". Themes: ${themes}`,
  themeFailed: 'Could not switch theme',
  themeSet: (name: string) => `Theme set to ${name}.`,
  commandDescription: 'Switch the tessera theme, copy the last reply, or show the demo',
  original: 'original',
  noPreview: '(no preview)',
  blocked: (rule: string) => `tessera blocked: ${rule}`,
  inboxFiled: (count: number, regressed: number[]) => `Inbox: filed ${count}${regressed.length ? ` · looks like fixed ${regressed.map(n => `#${n}`).join(', ')} again` : ''}`,
  inboxMarked: (ids: number[], commit: string) => `Marked ${ids.map(n => `#${n}`).join(', ') || 'nothing'} fixed in ${commit}.`,
  inboxEmpty: 'The inbox is empty. Paste a chat log with timestamped lines (22:55 Name message) to fill it.',
  inboxOff: 'The feedback inbox is off. Turn on feedbackInbox in /config.',
  drawingOff: 'tessera drawing is off (enabled in /config).',
}

const ZH: typeof EN = {
  copied: '已複製',
  copyFailed: '複製失敗',
  nothingToCopy: '還沒有可以複製的回覆。',
  noCodeBlock: '上一則回覆沒有程式碼區塊。',
  noPromptBlock: '上一則回覆沒有 prompt 卡片。',
  copiedPrompt: '已複製 prompt。',
  setupTitle: 'tessera 功能',
  setupHint: 'tessera：輸入 /tessera setup 選擇要開的功能。',
  setupOpened: '已開啟 tessera 功能設定。',
  closePane: '✕ 關閉',
  resumeScheduled: time => `額度用完了：tessera 會在 ${time} 自動繼續。期間你輸入任何內容就會取消。`,
  resumePrompt: '額度已重置，請從剛才中斷的地方繼續。',
  peekUsage: '用法：/tessera peek <檔案> 或 @檔案（.md、.csv、.json、.docx、.xlsx、.pptx）',
  peekUnreadable: path => `讀不到 ${path}（不存在或超過 4 MiB）。`,
  peekUnknown: path => `tessera 還不能預覽這種檔案：${path}`,
  pastedText: (n, lines) => `貼上的文字 #${n} · ${lines} 行`,
  carryTitle: n => `上次在這個專案還有 ${n} 項沒完成`,
  carryContinue: '接續',
  carryDismiss: '略過',
  carryPrompt: items => `上次在這個專案沒完成的待辦：\n${items.map(i => `- ${i}`).join('\n')}\n請確認哪些還需要做，接著處理。`,
  copiedReply: '已複製上一則回覆。',
  copiedCode: '已複製上一則回覆的最後一個程式碼區塊。',
  unknownTheme: (name, themes) => `沒有「${name}」這個主題。可用主題：${themes}`,
  themeFailed: '無法切換主題',
  themeSet: name => `主題已切換為 ${name}。`,
  commandDescription: '切換 tessera 主題、複製上一則回覆，或顯示示範',
  original: '原圖',
  noPreview: '（無法預覽）',
  blocked: rule => `tessera 已攔下：${rule}`,
  inboxFiled: (count, regressed) => `收件匣：新增 ${count} 則${regressed.length ? ` · 疑似 ${regressed.map(n => `#${n}`).join('、')} 又壞了` : ''}`,
  inboxMarked: (ids, commit) => `已將 ${ids.map(n => `#${n}`).join('、') || '（無）'} 標為已修（${commit}）。`,
  inboxEmpty: '收件匣是空的。貼上帶時間的聊天紀錄（22:55 名字 訊息）就會建立項目。',
  inboxOff: '回饋收件匣沒有開啟，請到 /config 打開 feedbackInbox。',
  drawingOff: 'tessera 的畫面美化已關閉（/config 的 enabled）。',
}

export const STRINGS: Record<Lang, typeof EN> = { en: EN, 'zh-TW': ZH }

// The first locale hint that names a language decides: any Chinese reads Traditional Chinese.
export function pickLang(option: unknown, hints: (string | undefined)[]): Lang {
  if (option === 'en' || option === 'zh-TW') return option
  const hint = hints.find(h => h !== undefined && h !== '' && h !== 'C' && h !== 'POSIX')
  return hint !== undefined && /^zh|chinese|中文/i.test(hint) ? 'zh-TW' : 'en'
}
