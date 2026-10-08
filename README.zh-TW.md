<p align="center">
  <img src="docs/banner.svg" alt="tessera：給每一種終端機的 Claude Code mod" width="100%">
</p>

<p align="center">
  <a href="https://github.com/OG-Matcha/tessera/actions/workflows/ci.yml"><img src="https://github.com/OG-Matcha/tessera/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/OG-Matcha/tessera/releases"><img src="https://img.shields.io/github/v/release/OG-Matcha/tessera?color=89b4fa" alt="版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/OG-Matcha/tessera?color=a6e3a1" alt="MIT 授權"></a>
  <img src="https://img.shields.io/badge/Claude_Code-%E2%89%A52.1.292-cba6f7" alt="Claude Code 2.1.292 以上">
  <img src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-tested-94e2d5" alt="Windows、macOS、Linux">
</p>

<p align="center">
  <img src="docs/demo.gif" alt="在 Claude Code 貼上圖表：輸入框上方出現縮圖，回覆畫出中文對齊的表格和長條圖" width="760">
  <br><sub>錄自一般終端機裡的真實 session：貼上的圖片顯示成縮圖，回覆畫出表格和長條圖。</sub>
</p>

<p align="center">
  <a href="README.md">English</a> · 繁體中文
</p>

**tessera** 是一個 [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview)：把 Claude Code 藏起來的東西顯示出來，並擋下會讓你損失工作的錯誤。貼上的圖片和文字看得到、回覆裡的表格和圖表中文不跑版、長時間的多 agent 執行有守門。裝一個就好，每項功能都能開關，關掉的功能完全不佔資源。

## 解決了什麼

| 問題 | 回報 | tessera |
| --- | --- | --- |
| 在多數終端機裡，貼上的圖只顯示 `[Image #1]` | | 輸入框上方顯示縮圖：kitty、Ghostty 顯示原圖，其他終端機用色塊 |
| 貼上的文字送出前就被摺疊成 `[Pasted text #1 +40 lines]` | [#23134](https://github.com/anthropics/claude-code/issues/23134) | 在輸入框上方顯示前幾行 |
| 韓文、中文、日文被寫成 `\uXXXX`，結果變成錯字 | [#83033](https://github.com/anthropics/claude-code/issues/83033) | 寫入前就擋下 |
| 用中文問問題，因為貼的 log 是英文，Claude 就用英文回答 | | 依你自己打的字的語言回覆 |
| 遞迴刪除沿著 junction 刪進主 repo | | 目標底下有連結就擋下 |
| agent 的 `git checkout`、`git stash` 改掉其他 agent 正在用的工作區 | | agent 執行時擋下 |
| 額度用完，工作停好幾個小時 | [#13354](https://github.com/anthropics/claude-code/issues/13354) | 選用：重置後自動繼續 |
| Read 工具沒顯示讀了哪個檔 | [#21151](https://github.com/anthropics/claude-code/issues/21151) | 工具列會顯示檔名 |
| 從終端機複製會多出縮排和行尾空白 | [#18170](https://github.com/anthropics/claude-code/issues/18170) | 複製按鈕和 `/tessera copy` 複製出乾淨的文字 |

## 安裝

```sh
claude plugin marketplace add OG-Matcha/tessera
claude plugin install tessera@tessera --scope user
```

開一個新 session，輸入 `/tessera setup` 選擇要開的功能。

想自動收到新版本：開啟 `/plugin`，到 **Marketplaces** 選 **tessera**，再選 **Enable auto-update**。Anthropic 官方以外的 marketplace，Claude Code 預設不自動更新。沒開的話，可以手動更新：

```sh
claude plugin marketplace update tessera
claude plugin update tessera@tessera
```

> [!IMPORTANT]
> tessera 已經包含 [prismantis](https://github.com/NahumLitvin/prismantis) 的回覆美化，以及 [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view) 的貼圖預覽概念。請先移除這兩個 mod，兩個 mod 畫同一塊畫面會互相衝突。

## 功能

| 功能 | 預設 | 說明 |
| --- | --- | --- |
| 回覆美化 | 開 | 表格、標題、程式碼上色、mermaid 圖表、工具列、複製按鈕；16 套主題 |
| 貼上預覽 | 開 | 輸入框上方顯示圖片縮圖和被摺疊的文字；「原圖」會在 Orca 分頁、VS Code 分頁或系統檢視器開啟 |
| 用我的語言回覆 | 開 | 你自己打的字是中文、日文或韓文時，Claude 用同一種語言回覆；貼上的程式碼、log、引用不算 |
| 工作區守門 | 開 | 擋下穿過連結的遞迴刪除、連到 `node_modules` 的連結；agent 執行時擋下改寫主樹和 `git add -A` |
| 中日韓跳脫守門 | 開 | 擋下把中日韓文字寫成 `\uXXXX` |
| 繁簡守門 | 自動 | 你用繁體中文時，擋下寫進檔案的簡體字並列出台灣用字（`这→這`）；zh-CN 檔案、本來就是簡體的檔案、日文行不檢查 |
| agent 必須挑模型 | 關 | Agent 和 Workflow 必須依任務指定模型 |
| Workflow 引用原話 | 關 | Workflow 腳本必須逐字引用你說過的話，agent 才不會因為你後來的一句提問就停工 |
| 客戶回饋收件匣 | 關 | 貼上的聊天紀錄（`22:55 名字 訊息`）變成編號項目；和已修項目相似的抱怨會標成可能回歸 |
| 額度重置後續跑 | 關 | 額度用完中斷後，在重置後一分鐘自動繼續 |

Claude 替其他 agent 或工具寫的 prompt，會畫成一張附 token 估計和複製按鈕的卡片。

## 指令

| 指令 | 用途 |
| --- | --- |
| `/tessera setup` | 開關各項功能 |
| `/tessera peek <檔案>` | 在終端機預覽 Markdown、CSV、JSON、docx、xlsx、pptx |
| `/tessera copy` · `copy code` · `copy prompt` | 複製上一則回覆、最後一個程式碼區塊或 prompt 卡片 |
| `/tessera inbox` · `inbox fixed 3 5` | 列出收件匣、以目前的 commit 標記已修 |
| `/tessera theme <名稱>` | 換主題 |
| `/tessera demo` | 示範所有元素 |

輸入 `/tessera ` 再打一個字母，就會出現附說明的建議。

## 終端機

| 終端機 | 貼圖預覽 | 「原圖」開在 |
| --- | --- | --- |
| kitty、Ghostty | 原圖 | 系統檢視器 |
| Windows Terminal、iTerm2、Apple Terminal、SSH | 色塊 | 系統檢視器（`explorer`、`open`、`xdg-open`） |
| Orca | 色塊 | Orca 瀏覽器分頁 |
| VS Code、Cursor | 色塊 | VS Code 分頁 |
| tmux、screen 裡 | 色塊 | 同上 |
| WSL | 色塊 | 透過 `\\wsl.localhost` 用 Windows 檢視器 |

偵測不準時，在 `/config` 把 `imageMode` 設成 `pixels` 或 `cells`。Orca 能畫 kitty 圖片，但還不支援 Claude Code 使用的 Unicode 佔位字元（[stablyai/orca#23615](https://github.com/stablyai/orca/issues/23615)）。

## 在你電腦上做了什麼

不連網。會讀 Claude Code 的貼圖快取、Workflow 啟動時的腳本、你用 `peek` 指定的檔案，以及 Claude 要寫入簡體字的那個檔案；會執行 `git rev-parse`、遞迴刪除前的連結檢查，以及你按「原圖」時對應平台的檢視器。細節見 [SECURITY.md](SECURITY.md)。

## 常見問題

**會拖慢 Claude Code 嗎？** 關掉的功能不登記任何 hook 和計時器。貼上預覽開啟時，每秒檢查輸入框四次。

**會多用 token 嗎？** 圖表提示約 250 tokens；你打的字不是英文時，語言說明約 65 tokens。兩者都是每段 context 只送一次，不會每則 prompt 都送；只有 compaction 把它們清掉、或你換了語言時才會再送。兩者都能關。

**為什麼不直接裝 prismantis 和 cc-mod-image-view？** 如果你用 macOS 或 Linux，而且終端機支援 kitty 圖片，可以。tessera 是為其他情況而做的：Windows、中日韓文字、沒有圖片協定的終端機，以及長時間的 agent 執行。

## 致謝

回覆美化改編自 Nahum Litvin 的 [prismantis](https://github.com/NahumLitvin/prismantis)；貼圖快取的找法參考 gggodlin 的 [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view)，它源自 Jarrod Watts 的 [claude-image-view](https://github.com/jarrodwatts/claude-image-view)；PNG 和 zip 解壓縮使用 [fflate](https://github.com/101arrowz/fflate)。皆為 MIT 授權，見 [NOTICE](NOTICE)。

## 參與

歡迎用中文或英文開 issue 和 PR。請先讀 [CONTRIBUTING.md](CONTRIBUTING.md)，並遵守[行為準則](CODE_OF_CONDUCT.md)。問題請到 [Discussions](https://github.com/OG-Matcha/tessera/discussions)（見 [SUPPORT.md](SUPPORT.md)），每個版本的變更記在 [CHANGELOG.md](CHANGELOG.md)。

## 授權

[MIT](LICENSE)
