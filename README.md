# tessera

[English](#english) · 繁體中文

一個 Claude Code mod，裝一個就好：貼圖預覽、上色的回覆、長時間 Workflow 的指揮台。以 Windows 和繁體中文使用者為優先，在 macOS、Linux 上一樣能用。

> 回覆的美化（主題、表格、程式碼上色、mermaid 圖、工具列）建立在 [prismantis](https://github.com/NahumLitvin/prismantis) 之上，貼圖快取的找法參考 [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view)，兩者皆為 MIT 授權，細節見 [NOTICE](NOTICE)。tessera 把它們合成一個 mod，避免多個 mod 搶畫同一個畫面，並補上它們沒有的部分。

## 和原本那些 mod 不一樣的地方

| | tessera |
|---|---|
| 貼圖預覽 | 支援 kitty 圖片協定的終端機（kitty、Ghostty）顯示原圖；其他終端機（Windows Terminal、Orca、VS Code）改用色塊縮圖，不會只剩 `[Image #1]`。「原圖」按鈕用系統檢視器開全解析度 |
| Windows | 貼圖快取在 `%TEMP%\claude`，路徑、開檔都照 Windows 的方式處理 |
| 中文 | 表格與 mermaid 節點都以全形寬度計算，框線不跑版；按鈕、提示、`/tessera` 說明有繁體中文 |
| Workflow 指揮台 | 開發中：跑前守門、跑中進度、跑後摘要 |

## 安裝

```powershell
claude plugin marketplace add OG-Matcha/tessera
claude plugin install tessera@tessera --scope user
```

需要 Claude Code 2.1.287 以上。裝完開新的 session 生效。

## 使用

- 在輸入框貼圖，上方就會出現縮圖。
- `/tessera`：說明。`/tessera demo`：完整示範。`/tessera theme nord`：換主題。`/tessera copy`：複製上一則回覆。
- 其他設定在 `/config` 裡找 tessera：`language`、`imageMode`（auto / pixels / cells）、`thumbnailSize`、主題與各種顏色。

## 開發

```sh
claude plugin validate .
claude plugin test .
sh scripts/sync-dev.sh <這個 session 的 dev-mods 資料夾>   # 熱重載測試
```

---

## English

One Claude Code mod instead of several: pasted-image previews, themed replies, and a desk for long Workflow runs. Windows and Traditional Chinese first; macOS and Linux work too.

The reply rendering (themes, tables, Prism code, mermaid art, tool rows) is built on [prismantis](https://github.com/NahumLitvin/prismantis), and the paste-cache lookup follows [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view), both MIT; see [NOTICE](NOTICE). tessera merges them so no two mods fight over one component, and adds:

- **Image previews everywhere.** Real pixels where kitty graphics draw (kitty, Ghostty); quadrant-block cell art elsewhere (Windows Terminal, Orca, VS Code), plus an "original" button that opens the system viewer.
- **Windows.** The paste cache under `%TEMP%\claude`, Windows paths and viewers.
- **CJK.** Tables and mermaid boxes measure full-width characters as two columns; zh-TW buttons, toasts and help.
- **Workflow desk** (in progress): guards before a run, progress during it, a digest after it.

```sh
claude plugin marketplace add OG-Matcha/tessera
claude plugin install tessera@tessera --scope user
```

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
