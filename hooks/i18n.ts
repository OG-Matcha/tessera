export type Lang = 'en' | 'zh-TW'

export type ToolKind = 'command' | 'read' | 'edit' | 'pattern' | 'page' | 'task'

// The words of tessera's tool rows: one verb per tool, a phrase per kind for a group of calls.
export type ToolWords = {
  verbs: Record<string, string>
  group: (kind: ToolKind, n: number) => string
  other: (name: string, n: number) => string
  join: string
  failed: (n: number) => string
  failedRow: string
  interrupted: string
  last: string
}

const EN_GROUPS: Record<ToolKind, [string, string]> = {
  command: ['ran', 'command'],
  read: ['read', 'file'],
  edit: ['edited', 'file'],
  pattern: ['searched', 'pattern'],
  page: ['fetched', 'page'],
  task: ['delegated', 'task'],
}
const plural = (noun: string, n: number) => (n === 1 ? noun : noun.endsWith('h') ? `${noun}es` : `${noun}s`)

const TOOL_WORDS_EN: ToolWords = {
  verbs: {
    Bash: 'Ran', PowerShell: 'Ran', Read: 'Read', Write: 'Wrote', Edit: 'Edited', MultiEdit: 'Edited', NotebookEdit: 'Edited',
    Grep: 'Searched', Glob: 'Listed', WebFetch: 'Fetched', WebSearch: 'Searched the web for', Agent: 'Delegated', Task: 'Delegated',
  },
  group: (kind, n) => `${EN_GROUPS[kind][0]} ${n} ${plural(EN_GROUPS[kind][1], n)}`,
  other: (name, n) => `used ${n} ${plural(name, n)}`,
  join: ', ',
  failed: n => ` · ${n} failed`,
  failedRow: ' failed',
  interrupted: ' interrupted',
  last: ' · last: ',
}

const ZH_GROUPS: Record<ToolKind, [string, string]> = {
  command: ['執行', '個指令'],
  read: ['讀取', '個檔案'],
  edit: ['編輯', '個檔案'],
  pattern: ['搜尋', '個模式'],
  page: ['抓取', '個網頁'],
  task: ['委派', '個任務'],
}

const TOOL_WORDS_ZH: ToolWords = {
  verbs: {
    Bash: '執行', PowerShell: '執行', Read: '讀取', Write: '寫入', Edit: '編輯', MultiEdit: '編輯', NotebookEdit: '編輯',
    Grep: '搜尋', Glob: '列出', WebFetch: '抓取', WebSearch: '網路搜尋', Agent: '委派', Task: '委派',
  },
  group: (kind, n) => `${ZH_GROUPS[kind][0]} ${n} ${ZH_GROUPS[kind][1]}`,
  other: (name, n) => `使用 ${name} ${n} 次`,
  join: '，',
  failed: n => ` · ${n} 個失敗`,
  failedRow: ' 失敗',
  interrupted: ' 已中斷',
  last: ' · 最後：',
}

// The names the guards give their rules in the toast; the reason the model reads stays English.
const RULES_EN = {
  'node_modules link': 'node_modules link',
  'delete through a link': 'delete through a link',
  'git add -A': 'git add -A',
  'git tree rewrite': 'git tree rewrite',
  'force push': 'force push',
  'discard changes': 'discarding changes',
  'zh-TW wording': 'zh-TW wording',
  'project glossary': 'project glossary',
  'unquoted heredoc': 'unquoted heredoc',
  'Workflow model': 'Workflow model',
  'Workflow authorization': 'Workflow authorization',
  'CJK as \\u escapes': 'CJK as \\u escapes',
  'Agent model': 'Agent model',
}

export type Rule = keyof typeof RULES_EN

const RULES_ZH: Record<Rule, string> = {
  'node_modules link': '連結 node_modules',
  'delete through a link': '刪除會穿過連結',
  'git add -A': 'git add -A',
  'git tree rewrite': '改寫主工作區',
  'force push': '強制推送',
  'discard changes': '丟棄未提交的改動',
  'zh-TW wording': '繁中用語',
  'project glossary': '專案用語表',
  'unquoted heredoc': '未加引號的 heredoc',
  'Workflow model': 'Workflow 未指定模型',
  'Workflow authorization': 'Workflow 未引用你的話',
  'CJK as \\u escapes': 'CJK 寫成 \\u 跳脫',
  'Agent model': 'Agent 未指定模型',
}

const EN = {
  copied: 'Copied',
  toolWords: TOOL_WORDS_EN,
  copyLabels: { block: '⧉ copy', reply: '⧉ copy reply', prompt: '⧉ copy prompt', source: '⧉ source', art: '⧉ art' },
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
  agentPicked: (task: string, model: string) => `tessera: ${task} → ${model}`,
  carryDismiss: 'dismiss',
  diffSummary: (added: number, removed: number) => `Added ${added} ${added === 1 ? 'line' : 'lines'}, removed ${removed} ${removed === 1 ? 'line' : 'lines'}`,
  diffHidden: (n: number) => `${n} more ${n === 1 ? 'line' : 'lines'}`,
  diffExpand: 'expand',
  updateTitle: 'tessera gets no updates: auto-update is off for its marketplace',
  updateOpen: 'open /plugin',
  updateLater: 'not now',
  updateSteps: (market: string) => `In /plugin: Marketplaces → ${market} → Enable auto-update`,
  carryPrompt: (items: string[]) => `Unfinished tasks from the last session in this project:\n${items.map(i => `- ${i}`).join('\n')}\nCheck which still apply and carry on with them.`,
  copiedReply: 'Copied the last reply.',
  copiedCode: 'Copied the last code block.',
  unknownTheme: (name: string, themes: string) => `Unknown theme "${name}". Themes: ${themes}`,
  themeFailed: 'Could not switch theme',
  themeSet: (name: string) => `Theme set to ${name}.`,
  commandDescription: 'Pick tessera features, preview a document, switch theme, copy the last reply, or show the demo',
  original: 'original',
  noPreview: '(no preview)',
  blocked: (rule: Rule) => `tessera blocked: ${RULES_EN[rule]}`,
  reminded: (rule: Rule) => `tessera asked Claude to confirm: ${RULES_EN[rule]}`,
  inboxFiled: (count: number, regressed: number[]) => `Inbox: filed ${count}${regressed.length ? ` · looks like fixed ${regressed.map(n => `#${n}`).join(', ')} again` : ''}`,
  inboxMarked: (ids: number[], commit: string) => `Marked ${ids.map(n => `#${n}`).join(', ') || 'nothing'} fixed in ${commit}.`,
  inboxHeaders: ['#', 'Time', 'From', 'Message', 'Status'],
  inboxEmpty: 'The inbox is empty. Paste a chat log with timestamped lines (22:55 Name message) to fill it.',
  inboxOff: 'The feedback inbox is off. Turn on feedbackInbox in /config.',
  drawingOff: 'tessera drawing is off (enabled in /config).',
}

const ZH: typeof EN = {
  copied: '已複製',
  toolWords: TOOL_WORDS_ZH,
  copyLabels: { block: '⧉ 複製', reply: '⧉ 複製回覆', prompt: '⧉ 複製 prompt', source: '⧉ 原始碼', art: '⧉ 文字圖' },
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
  agentPicked: (task, model) => `tessera：${task} → ${model}`,
  carryDismiss: '略過',
  diffSummary: (added, removed) => `新增 ${added} 行，刪除 ${removed} 行`,
  diffHidden: n => `還有 ${n} 行未顯示`,
  diffExpand: '展開',
  updateTitle: 'tessera 收不到更新：它的 marketplace 沒開自動更新',
  updateOpen: '打開 /plugin',
  updateLater: '不用了',
  updateSteps: market => `在 /plugin 裡：Marketplaces → ${market} → Enable auto-update`,
  carryPrompt: items => `上次在這個專案沒完成的待辦：\n${items.map(i => `- ${i}`).join('\n')}\n請確認哪些還需要做，接著處理。`,
  copiedReply: '已複製上一則回覆。',
  copiedCode: '已複製上一則回覆的最後一個程式碼區塊。',
  unknownTheme: (name, themes) => `沒有「${name}」這個主題。可用主題：${themes}`,
  themeFailed: '無法切換主題',
  themeSet: name => `主題已切換為 ${name}。`,
  commandDescription: '挑選 tessera 功能、預覽文件、切換主題、複製上一則回覆，或顯示示範',
  original: '原圖',
  noPreview: '（無法預覽）',
  blocked: rule => `tessera 已攔下：${RULES_ZH[rule]}`,
  reminded: rule => `tessera 已請 Claude 再確認：${RULES_ZH[rule]}`,
  inboxFiled: (count, regressed) => `收件匣：新增 ${count} 則${regressed.length ? ` · 疑似 ${regressed.map(n => `#${n}`).join('、')} 又壞了` : ''}`,
  inboxMarked: (ids, commit) => `已將 ${ids.map(n => `#${n}`).join('、') || '（無）'} 標為已修（${commit}）。`,
  inboxHeaders: ['#', '時間', '誰', '內容', '狀態'],
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
