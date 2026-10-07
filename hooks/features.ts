import type { Lang } from './i18n'

export type Feature = {
  key: string
  isOn: (value: unknown) => boolean
  on: string | boolean
  off: string | boolean
  name: Record<Lang, string>
  about: Record<Lang, string>
}

const flag = (key: string, onByDefault: boolean, name: Record<Lang, string>, about: Record<Lang, string>): Feature => ({
  key,
  isOn: v => (onByDefault ? v !== false : v === true),
  on: true,
  off: false,
  name,
  about,
})

// Every feature /tessera setup lists, with the option that switches it.
export const FEATURES: Feature[] = [
  flag('enabled', true, { en: 'Themed replies', 'zh-TW': '回覆美化' }, { en: 'Tables, code, diagrams and tool rows drawn by tessera', 'zh-TW': '表格、程式碼、圖表和工具列由 tessera 繪製' }),
  flag('pastePreview', true, { en: 'Paste previews', 'zh-TW': '貼上預覽' }, { en: 'Pasted images and collapsed text shown above the prompt', 'zh-TW': '輸入框上方顯示貼上的圖片縮圖和被摺疊的文字' }),
  {
    key: 'replyLanguage',
    isOn: v => v !== 'off',
    on: 'auto',
    off: 'off',
    name: { en: 'Reply in my language', 'zh-TW': '用我的語言回覆' },
    about: { en: 'Claude replies in the language of your own words', 'zh-TW': 'Claude 依你自己打的字的語言回覆' },
  },
  flag('guardGit', true, { en: 'Tree guard', 'zh-TW': '工作區守門' }, { en: 'Blocks tree rewrites while agents run and deletes through links', 'zh-TW': 'agent 執行時擋下改寫主樹，以及會穿過連結的刪除' }),
  flag('guardCjkEscapes', true, { en: 'CJK escape guard', 'zh-TW': '中日韓跳脫守門' }, { en: 'Blocks Korean, Chinese or Japanese written as \\u escapes', 'zh-TW': '擋下把中日韓文字寫成 \\u 跳脫碼' }),
  {
    key: 'agentModel',
    isOn: v => v !== undefined && v !== 'off',
    on: 'choose',
    off: 'off',
    name: { en: 'Agents pick a model', 'zh-TW': 'agent 必須挑模型' },
    about: { en: 'Agent and Workflow calls must name a model for their task', 'zh-TW': 'Agent 與 Workflow 必須依任務指定模型' },
  },
  flag('requireUserQuote', false, { en: 'Workflows quote you', 'zh-TW': 'Workflow 引用原話' }, { en: 'A Workflow script must carry your own words', 'zh-TW': 'Workflow 腳本必須逐字引用你說過的話' }),
  flag('feedbackInbox', false, { en: 'Client feedback inbox', 'zh-TW': '客戶回饋收件匣' }, { en: 'Pasted chat logs become items; regressions are flagged', 'zh-TW': '貼上的聊天紀錄變成項目，並偵測回歸' }),
]
