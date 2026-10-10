import type { Lang } from './i18n'

type Feature = {
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

export const FEATURES: Feature[] = [
  flag('enabled', true, { en: 'Themed replies', 'zh-TW': '回覆美化' }, { en: 'Tables, code, diagrams and tool rows drawn by tessera', 'zh-TW': '表格、程式碼、圖表和工具列由 tessera 繪製' }),
  flag('foldDiffs', true, { en: 'Fold long diffs', 'zh-TW': '摺疊長差異' }, { en: 'Long edit diffs show a few removed and added lines and an expand button', 'zh-TW': '過長的改檔差異只顯示刪掉和新增的前幾行，按「展開」看全部' }),
  flag('pastePreview', true, { en: 'Paste previews', 'zh-TW': '貼上預覽' }, { en: 'Pasted images and collapsed text shown above the prompt', 'zh-TW': '輸入框上方顯示貼上的圖片縮圖和被摺疊的文字' }),
  {
    key: 'replyLanguage',
    isOn: v => v !== 'off',
    on: 'auto',
    off: 'off',
    name: { en: 'Reply in my language', 'zh-TW': '用我的語言回覆' },
    about: { en: 'Claude replies in the language of your own words', 'zh-TW': 'Claude 依你自己打的字的語言回覆' },
  },
  flag('carryOver', true, { en: 'Carry over tasks', 'zh-TW': '接續未完成' }, { en: 'Offers tasks left open here, in a new session or after /clear; turns on Claude task tools', 'zh-TW': '新 session 或 /clear 後提示這個專案上次沒做完的待辦，並替 Claude 打開待辦工具' }),
  flag('guardGit', true, { en: 'Tree guard', 'zh-TW': '工作區守門' }, { en: 'Blocks tree rewrites while agents run, deletes through links; reminds before force-pushing main or discarding uncommitted work', 'zh-TW': 'agent 執行時擋下改寫主樹、會穿過連結的刪除；強制推送 main 或丟棄未提交的改動前提醒' }),
  flag('guardCjkEscapes', true, { en: 'CJK escape guard', 'zh-TW': '中日韓跳脫守門' }, { en: 'Refuses Korean, Chinese or Japanese written as \\u escapes in prose and prompts; reminds once in code', 'zh-TW': '文件和提示裡把中日韓文字寫成 \\u 跳脫碼時擋下，程式碼裡提醒一次' }),
  {
    key: 'guardSimplified',
    isOn: v => v !== 'off',
    on: 'auto',
    off: 'off',
    name: { en: 'Traditional Chinese guard', 'zh-TW': '繁簡守門' },
    about: { en: 'While you write Traditional Chinese, reminds once before Simplified characters or zh-CN terms go into a file', 'zh-TW': '你用繁體中文時，簡體字和簡中用語寫進檔案前提醒一次' },
  },
  flag('guardHeredoc', true, { en: 'Heredoc guard', 'zh-TW': 'heredoc 守門' }, { en: 'Reminds once before an unquoted heredoc expands ${...} or eats backslashes', 'zh-TW': '沒加引號的 heredoc 會展開 ${...} 或吃掉反斜線時提醒一次' }),
  flag('guardGlossary', false, { en: 'Glossary guard', 'zh-TW': '用語表守門' }, { en: 'Reminds once before a wording the glossary in CLAUDE.md says to avoid is written', 'zh-TW': 'CLAUDE.md 用語表裡標為避免的寫法寫進檔案前提醒一次' }),
  {
    key: 'agentModel',
    isOn: v => v !== 'off',
    on: 'auto',
    off: 'off',
    name: { en: 'Model per agent', 'zh-TW': 'agent 自動選模型' },
    about: { en: 'Picks haiku, sonnet, opus or fable for each agent by its task', 'zh-TW': '依任務替每個 agent 挑 haiku、sonnet、opus 或 fable' },
  },
  flag('requireUserQuote', false, { en: 'Workflows quote you', 'zh-TW': 'Workflow 引用原話' }, { en: 'A Workflow script must carry your own words', 'zh-TW': 'Workflow 腳本必須逐字引用你說過的話' }),
  flag('resumeAfterLimit', false, { en: 'Resume after limits', 'zh-TW': '額度重置後續跑' }, { en: 'When a usage limit stops work, continue at the reset', 'zh-TW': '額度用完中斷時，在重置後自動繼續' }),
  flag('feedbackInbox', false, { en: 'Client feedback inbox', 'zh-TW': '客戶回饋收件匣' }, { en: 'Pasted chat logs become items; regressions are flagged', 'zh-TW': '貼上的聊天紀錄變成項目，並偵測回歸' }),
]
