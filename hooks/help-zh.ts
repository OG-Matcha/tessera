const dark = (themes: readonly string[]) => themes.filter(t => !/latte|light|dawn/.test(t) && t !== 'mono').join('、')
const light = (themes: readonly string[]) => themes.filter(t => /latte|light|dawn/.test(t)).join('、')

export const helpTextZh = (themes: readonly string[]): string => `
## 指令

| 指令 | 用途 |
|------|------|
| \`/tessera theme <名稱>\` | 立即切換主題 |
| \`/tessera copy\` | 複製上一則回覆；\`copy code\` 只複製最後一個程式碼區塊 |
| \`/tessera demo\` | 完整示範：每種元素和圖表 |
| \`/tessera inbox\` | 客戶回饋收件匣（需在 /config 開啟 feedbackInbox）；\`inbox fixed 3 5\` 標為已修 |

### ${themes.length} 套主題

- 深色：${dark(themes)}
- 淺色：${light(themes)}
- 單色：mono，只用粗體和淡色

說明與回報問題：https://github.com/OG-Matcha/tessera

> [!TIP]
> 個別顏色的設定優先於主題。在 \`/config\` 把 \`headingColor\` 或 \`numberColor\` 設成色碼即可。

### 貼圖預覽

在輸入框貼圖後，上方會出現縮圖。支援 kitty 圖片協定的終端機（kitty、Ghostty）顯示原圖；其他終端機用色塊縮圖，按「原圖」用系統檢視器打開。
`

export const showcaseTextZh = (themes: readonly string[]): string => `
# tessera

在終端機裡把 Claude 的回覆畫得更好讀：**粗體**、*斜體*、~~刪除線~~、\`行內程式碼\`、[連結](https://github.com/OG-Matcha/tessera)，數字如 99.9% 與 250ms、路徑如 ~/src/app.ts 都會上色。

## 表格會算中文寬度

| 功能 | 狀態 | 何時出現 |
|------|------|------|
| 貼上預覽 | ✅ 開 | 貼上圖片或長文字 |
| 繁簡守門 | ✅ 開 | 寫入簡體字或簡中用語 |
| 接續未完成 | ✅ 開 | 新 session 開始 |

> [!NOTE]
> 共 ${themes.length} 套主題。深色：${dark(themes)}；淺色：${light(themes)}；mono 不用顏色。

> [!WARNING]
> 會「選取即複製」的終端機（例如 Warp）點複製按鈕時可能變成選取文字，請改用 \`/tessera copy\`。

### 待辦清單

- [x] 解析回覆
- [x] 畫出來
  - [x] 表格與程式碼
  - [ ] 桌面版的圖表
- [ ] 發布下一版

### 程式碼

\`\`\`powershell
claude plugin install tessera@tessera --scope user
\`\`\`

### 圖表：中文節點不跑版

\`\`\`mermaid
flowchart LR
    A[貼上圖片] --> B[輸入框預覽]
    B --> C[送出]
    C --> D[回覆上色]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    participant U as 你
    participant C as Claude
    participant T as tessera
    U->>C: 提問
    C->>T: markdown
    T-->>U: 上色後的回覆
\`\`\`

> 引言複製時不會帶 \`> \` 符號。
`
