import HANS from './vendor/hans.js'

// Characters that only Simplified Chinese uses, each with its Taiwan Traditional form.
const TRADITIONAL = new Map(HANS.split('|').map(pair => [...pair] as [string, string]))

// Mainland software and interface terms with the word Taiwan uses. Terms Taiwan writing also uses for the
// same meaning (代碼 in 錯誤代碼, 用戶 in 用戶端, 優化, 參數, 支持, 項目) and ones that cut across words (字符 in 文字符號) stay out.
const TERMS = new Map(
  (
    '源代碼 原始碼|源碼 原始碼|信息 資訊|默認 預設|字符串 字串|字節 位元組|創建 建立|加載 載入|' +
    '內存 記憶體|硬盤 硬碟|光標 游標|鼠標 滑鼠|屏幕 螢幕|視頻 影片|音頻 音訊|網絡 網路|互聯網 網際網路|服務器 伺服器|服務端 伺服器端|' +
    '數據庫 資料庫|文件夾 資料夾|軟件 軟體|硬件 硬體|程序員 程式設計師|菜單 選單|界面 介面|調試 除錯|線程 執行緒|' +
    '變量 變數|常量 常數|數組 陣列|接口 介面|模塊 模組|組件 元件|鏈接 連結|博客 部落格|激活 啟用|緩存 快取|端口 連接埠|' +
    '打印 列印|粘貼 貼上|命令行 命令列|二進制 二進位|十六進制 十六進位|異步 非同步|哈希 雜湊|堆棧 堆疊|隊列 佇列|遞歸 遞迴|指針 指標|' +
    '調用 呼叫|返回值 回傳值|布爾 布林|文檔 文件|分辨率 解析度|搜索 搜尋|視圖 檢視|彈窗 彈出視窗|移動端 行動裝置|' +
    '賬號 帳號|賬戶 帳戶|郵箱 信箱|短信 簡訊|運營 營運|營銷 行銷|兼容 相容|獲取 取得|存儲 儲存|局域網 區域網路|寬帶 寬頻'
  )
    .split('|')
    .map(pair => pair.split(' ') as [string, string]),
)
const TERM = new RegExp([...TERMS.keys()].sort((a, b) => b.length - a.length).join('|'), 'g')

// Files meant to hold Simplified text: zh-CN, zh-SG and zh-Hans locales.
const SIMPLIFIED_FILE = /zh[-_](cn|sg|my|hans)|hans|\bchs\b/i
// Japanese shares many Simplified-looking forms (点, 画, 号), so lines with kana are not checked.
const KANA = /[぀-ヿ]/

export function simplifiedChars(text: string): string[] {
  const found = new Set<string>()
  for (const ch of text) if (TRADITIONAL.has(ch)) found.add(ch)
  return [...found]
}

export const mainlandTerms = (text: string): string[] => [...new Set(text.match(TERM) ?? [])]

// What a write would bring into a file that reads as Taiwan Chinese, as "简→簡" and "代碼→程式碼" pairs.
// A file named for a Simplified locale or already holding Simplified text is left alone, and so is
// any term the file already uses.
export function taiwanFixes(path: string, texts: string[], existing: string): string[] {
  if (SIMPLIFIED_FILE.test(path) || simplifiedChars(existing).length > 0) return []
  const chinese = texts.flatMap(t => t.split('\n')).filter(line => !KANA.test(line)).join('\n')
  const known = new Set(mainlandTerms(existing))
  return [
    ...simplifiedChars(chinese).map(ch => `${ch}→${TRADITIONAL.get(ch)}`),
    ...mainlandTerms(chinese)
      .filter(term => !known.has(term))
      .map(term => `${term}→${TERMS.get(term)}`),
  ]
}
