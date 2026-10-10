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
  <img src="docs/demo.gif" alt="tessera 在 Claude Code 裡：貼上 30 行 log 先在輸入框上方預覽，回覆畫出中文對齊的表格，繁簡守門擋下簡體字寫入，最後把 32 行的修改摺疊成開頭幾行" width="760">
  <br><sub>錄自一般終端機裡的真實 session：貼上的 log 送出前就能預覽，回覆畫出中文對齊的表格；寫入簡體字時繁簡守門先擋一次，Claude 確認是引用原文後才再送。</sub>
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
| 韓文、中文、日文被寫成 `\uXXXX`，結果變成錯字 | [#83033](https://github.com/anthropics/claude-code/issues/83033) | 寫入前就擋下；程式碼裡可能是刻意的跳脫，提醒一次 |
| 編輯 Big5、Shift-JIS、GBK 檔案，內容被改寫成 `�` | [#7134](https://github.com/anthropics/claude-code/issues/7134) | 編輯前提醒一次，並說明是 UTF-16 還是舊式編碼（Big5、Shift-JIS、GBK、EUC-KR） |
| Claude 丟到背景的指令卡住了，沒人說，要等你去問 | | 安靜十分鐘後輸入框上方多一列，按鈕請 Claude 去看 |
| 用中文問問題，因為貼的 log 是英文，Claude 就用英文回答 | | 依你自己打的字的語言回覆 |
| 寫繁中專案時，Claude 寫進簡體字或簡中用語 | | 擋下一次，並列出 zh-TW 寫法 |
| 開新 session 或 `/clear` 之後，忘了上次還有什麼沒做 | | 輸入框上方提示沒做完的待辦 |
| 改一次檔，差異就塞滿整個畫面 | | 只顯示刪掉和新增的前幾行、增刪行數和「展開」按鈕 |
| Read 工具沒顯示讀了哪個檔 | [#21151](https://github.com/anthropics/claude-code/issues/21151) | 工具列會顯示檔名 |
| 從終端機複製會多出縮排和行尾空白 | [#18170](https://github.com/anthropics/claude-code/issues/18170) | 複製按鈕和 `/tessera copy` 複製出乾淨的文字 |

## 安裝

```sh
claude plugin marketplace add OG-Matcha/tessera
claude plugin install tessera@og-matcha --scope user
```

開一個新 session，輸入 `/tessera setup` 選擇要開的功能。

想自動收到新版本：開啟 `/plugin`，到 **Marketplaces** 選 **og-matcha**，再選 **Enable auto-update**。Anthropic 官方以外的 marketplace，Claude Code 預設不自動更新；tessera 會在輸入框上方提醒你一次，按鈕會幫你打開 `/plugin`。沒開的話，可以手動更新：

```sh
claude plugin marketplace update og-matcha
claude plugin update tessera@og-matcha
```

0.8.0 之前裝的是 `tessera@tessera`？marketplace 已從 `tessera` 改名為 `og-matcha`，讓另一個也叫 tessera 的 plugin 能同時安裝，舊的安裝不會再更新。搬一次就好：

```sh
claude plugin uninstall tessera@tessera
claude plugin marketplace remove tessera
claude plugin marketplace add OG-Matcha/tessera
claude plugin install tessera@og-matcha --scope user
```

Claude Code 的選項值跟著安裝 ID 走，搬完後用 `/tessera setup` 或 `/plugin configure tessera@og-matcha` 再選一次。

> [!IMPORTANT]
> tessera 已經包含 [prismantis](https://github.com/NahumLitvin/prismantis) 的回覆美化，以及 [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view) 的貼圖預覽概念。請先移除這兩個 mod，兩個 mod 畫同一塊畫面會互相衝突。

### 團隊或組織使用

要讓一個 repo 的每位協作者都有 tessera，把這兩個 key 放進 repo 的 `.claude/settings.json`。協作者信任這個資料夾後，Claude Code 會登記 marketplace；tessera 的 marketplace 以相對路徑列出它，所以下一個 session 起就直接從 marketplace 的副本載入，不用另外安裝：

```json
{
  "extraKnownMarketplaces": {
    "og-matcha": { "source": { "source": "github", "repo": "OG-Matcha/tessera" } }
  },
  "enabledPlugins": { "tessera@og-matcha": true }
}
```

選項值可以放在旁邊的 `pluginConfigs`，整個團隊共用一套設定：

```json
{
  "pluginConfigs": { "tessera@og-matcha": { "options": { "guardGlossary": true, "language": "zh-TW" } } }
}
```

整個組織要用，同樣的 `extraKnownMarketplaces` 和 `enabledPlugins` 放進[受管設定](https://code.claude.com/docs/en/plugins/org)；要讓新版自動到每台機器，在 marketplace 項目加 `"autoUpdate": true`。動手前有兩件事要知道：

- 設了 `allowManagedModsOnly` 的組織會拒絕所有從 GitHub 安裝的 mod，tessera 也不例外。要讓它算是組織自己的 mod，把本 repo 的某個版本複製到每台機器上只有管理員能寫的目錄，再把那個目錄登記成 marketplace（`"source": { "source": "directory", "path": "/opt/claude-plugins/tessera" }`）；tessera 的 marketplace 以相對路徑列出它，正是這一點讓它算是你們的。
- tessera 的守門是提醒，不是強制。提醒過的呼叫再送一次就會放行，裝的人也隨時能把 mod 關掉。要一條誰都過不了的規則，用受管設定裡的 `PreToolUse` hook。

部署前，在 checkout 裡執行 `claude plugin validate .`，會列出 tessera 處理的每個事件，以及它對檔案、程序、環境變數、設定的每一種呼叫；[SECURITY.md](SECURITY.md) 逐條說明。

## 功能

| 功能 | 預設 | 說明 |
| --- | --- | --- |
| 回覆美化 | 開 | 表格、標題、程式碼上色、mermaid 圖表、工具列、複製按鈕；16 套主題 |
| 摺疊長差異 | 開 | Edit、Write 的差異超過 12 行時，最多顯示 8 行（刪掉的前幾行和新增的前幾行）、增刪行數和 **展開**；ctrl+o 和 `--verbose` 顯示全部。只改顯示，Claude 讀到的內容不變 |
| 貼上預覽 | 開 | 輸入框上方顯示圖片縮圖和被摺疊的文字（文字從剪貼簿讀取，行數和貼上的一致才顯示）；「原圖」會在 Orca 分頁、VS Code 分頁或系統檢視器開啟 |
| 用我的語言回覆 | 開 | 你自己打的字是中文、日文或韓文時，Claude 用同一種語言回覆；貼上的程式碼、log、引用不算 |
| 接續未完成 | 開 | 新 session 或 `/clear` 之後，會提示這個 repo 上次沒做完的待辦：**接續** 把它們填進輸入框，**略過** 就不再提。它會在 session 裡替 Claude 打開待辦工具（`CLAUDE_CODE_ENABLE_TODO_TOOLS`，Claude Code 對 Claude 5.x 預設不開），你自己設過這個變數就照你的設定；打開後 Claude 可能在畫面上列出待辦清單（`Ctrl+T` 收起） |
| 中日韓跳脫守門 | 開 | 文件和提示裡把中日韓文字寫成 `\uXXXX` 時擋下；程式碼裡可能是刻意的跳脫，提醒一次 |
| 丟棄前先 stash | 關 | 工作區守門提醒過的丟棄指令（`git reset --hard`、`git checkout -- <路徑>`、`git restore`）再送一次時，先把會丟掉的已追蹤改動存進 `git stash`（`stash@{0}`），`git stash pop` 就能拿回來；只丟棄部分檔案時用 `git checkout stash@{0} -- <檔案>`（其他改動還在工作區時 pop 會拒絕），並以通知告知。這會寫入 repo 的 `.git`。`git clean` 沒有快照，stash 不含未追蹤檔案 |
| 資料庫守門 | 開 | 會把資料庫或其 volume 整個丟掉的指令前提醒一次：`prisma migrate reset`、`supabase db reset`、`rails db:drop`、`artisan migrate:fresh`、`docker compose down -v`、`docker volume rm`、`dropdb` 和同類指令；再送一次就執行 |
| 編碼守門 | 開 | 編輯既有、不是 UTF-8 的檔案（Big5、Shift-JIS、GBK、EUC-KR、UTF-16，1 MiB 以內）前提醒一次：Claude Code 以 UTF-8 讀寫檔案，內容會被改寫成 `�`（[#7134](https://github.com/anthropics/claude-code/issues/7134)）；再送一次就執行，這個 session 裡不再檢查那個檔案 |
| 多 session 守門 | 開 | 這台電腦上另一個 Claude Code session 30 分鐘內改過的檔案，Claude 要編輯前提醒一次：對方可能還在改，先重新讀過或問你；再送一次就執行。只認得裝了 tessera 的 session，你在編輯器裡改的不算 |
| 繁簡守門 | 自動 | 你用繁體中文時，簡體字和簡中用語寫進檔案前提醒一次，並列出繁中慣用寫法（`这→這`、`服務器→伺服器`）；zh-CN 檔案、本來就是簡體的檔案、檔案裡原本就用的詞、日文行不檢查 |

Claude 替其他 agent 或工具寫的 prompt，會畫成一張附 token 估計和複製按鈕的卡片。

### 防呆

預設開啟，平常不會出聲，出事時才擋。

| 功能 | 預設 | 說明 |
| --- | --- | --- |
| 監看背景工作 | 開 | Claude 丟到背景的指令十分鐘（`backgroundQuietMinutes`）沒有新輸出時，輸入框上方會多一列：**問 Claude** 把查看這個工作的請求填進輸入框，**忽略** 就不再提。卡住的指令本來不會回報，要等你去問才知道 |
| Python 用 UTF-8 | 開 | Windows 上替 session 設 `PYTHONUTF8=1`，Claude 執行的 Python 改用 UTF-8 讀寫，不再卡在系統 code page（中日韓文字出現 `UnicodeEncodeError` 或印成 `?`）；你自己設過這個變數就不動，其他系統上沒有作用 |
| 工作區守門 | 開 | 擋下對根目錄、磁碟、家目錄、session 目錄或其上層的遞迴刪除、穿過連結的遞迴刪除、連到 `node_modules` 的連結；強制推送到 `main` 或 `master` 前，以及 `git reset --hard`、`git checkout -- <路徑>`、`git restore`、`git clean -f` 會丟掉未提交的改動前，列出檔案提醒一次；agent 執行時擋下改寫主樹和 `git add -A` |
| heredoc 守門 | 開 | Bash 的 heredoc 分隔符號沒加引號（`<<EOF`），內文又會被 shell 改掉時提醒一次：`${x}`、`$(cmd)`、反引號被展開，`\\` 變成 `\`；再送一次就執行 |
| agent 自動選模型 | 自動 | 沒指定模型的 agent，由一次簡短的 Haiku 判斷依任務挑 haiku、sonnet、opus 或 fable，並跳通知告訴你；`choose` 則要求 Claude 自己指定。沒指定模型的 Workflow 腳本會被提醒一次，請 Claude 替每個 `agent()` 指定；設成 `choose` 或固定模型時則擋下，直到指定為止 |

### 選用

預設關閉，適合特定工作流程，在 `/tessera setup` 打開。

| 功能 | 預設 | 說明 |
| --- | --- | --- |
| 用語表守門 | 關 | repo 的 `CLAUDE.md` 有含 **用語** 和 **避免** 兩欄的表格時，寫入檔案帶到「避免」的寫法時提醒一次並列出該用的詞；沒有這種表格就什麼都不做 |
| Workflow 引用原話 | 關 | Workflow 腳本必須逐字引用你說過的話，agent 才不會因為你後來的一句提問就停工 |
| 客戶回饋收件匣 | 關 | 貼上的聊天紀錄（`22:55 名字 訊息`）變成編號項目；和已修項目相似的抱怨會標成可能回歸 |

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

## 在哪些地方能用

mod 的 hook 在每一種載入 plugin 的 session 都會跑；畫出來的東西只在 Claude Code 會畫 mod 的地方出現。[這張表](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run)是 Claude Code 官方的，對 tessera 來說是這樣：

| 你在哪裡跑 Claude Code | 守門、選項、接續未完成、監看背景工作 | 預覽、回覆美化、摺疊 diff、輸入框上方的列 |
| --- | --- | --- |
| 終端機，包括編輯器內建的終端機和 JetBrains 外掛 | 有 | 有；tessera 在這裡測試 |
| Desktop app 的 Code 分頁 | 有 | 回覆美化和摺疊 diff，由 Desktop app 用自己的元件畫；預覽和輸入框上方的列只在終端機；那裡沒測過 |
| Desktop app 裡的 WSL session | 沒有，那裡不支援 plugin | 沒有 |
| VS Code 擴充的對話面板 | 有 | 沒有，mod 畫的東西那裡都不出現 |
| `claude -p` 和 Agent SDK | 有 | 沒有 |
| 從 claude.ai 或手機遠端控制 | 有，在你電腦上的那個 session | 畫在你電腦的終端機 |
| 雲端 session | 只在 plugin 有帶到那個 session 時 | 沒有 |

## 在你電腦上做了什麼

自己不連網：唯一的模型呼叫，是沒指定模型的 Agent 呼叫各做一次簡短的 Haiku 判斷（`agentModel: auto`，預設開啟），走你自己的 Claude Code session。會讀你的 Claude Code 設定（`language`，以及 tessera 的 marketplace 有沒有開自動更新）、Claude Code 的貼圖快取、Workflow 啟動時的腳本、你用 `peek` 指定的檔案、repo 的 `CLAUDE.md`（找用語表），Claude 要寫入簡體字、簡中用語或用語表避免寫法的那個檔案，以及 Claude 要編輯的檔案的位元組（判斷編碼）；會執行 `git rev-parse`、遞迴刪除前的連結檢查、會丟掉改動的 git 指令前的 `git status`、`git diff` 或 `git clean -n`、「丟棄前先 stash」開著時在確認過的丟棄指令前的 `git stash create` 和 `git stash store`、每次貼上被摺疊的文字時讀一次剪貼簿，以及你按「原圖」時對應平台的檢視器；Claude 丟到背景的指令跑著時，每分鐘讀一次它輸出檔的大小；「接續未完成」開著時，會在 session 裡設定 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`，Windows 上「Python 用 UTF-8」開著時設定 `PYTHONUTF8=1`（你自己設過的都不動），不會寫入你的設定檔。細節見 [SECURITY.md](SECURITY.md)。

## 常見問題

**會拖慢 Claude Code 嗎？** 關掉的功能不登記任何 hook 和計時器。貼上預覽開啟時，每秒檢查輸入框四次。

**會多用 token 嗎？** 很少，而且只在寫明的地方。以下在 Claude Code 2.1.294 實測，第一次請求約 55,000 tokens：

| 功能 | 增加 | 時機 |
| --- | --- | --- |
| 圖表提示（回覆美化，`diagramHints`） | 約 300 tokens | 每段 context 一次，compaction 後再送 |
| 用我的語言回覆 | 約 70–100 tokens | 每段 context 一次；你換語言、或 Claude 上一則回覆跑成別的語言時再送 |
| 守門 | 擋下的理由，一小段 | 只有真的擋下時 |
| agent 自動選模型 | 另外一次 Haiku 呼叫，帶 agent 任務的前 2,000 字 | 每次沒指定模型的 Agent 呼叫；不進你的對話 |
| 接續未完成 | 量不出差別：Claude Code 用到待辦工具時才載入 | |
| 監看背景工作 | 沒有，除非你按 **問 Claude** 並送出它填好的提示 | |
| 客戶回饋收件匣 | 一段列出收進哪些項目的說明 | 你貼上聊天紀錄時 |
| 回覆美化、貼上預覽、摺疊長差異 | 0：只改顯示 | |

每一項都能在 `/tessera setup` 或 `/config` 關掉。

**為什麼不直接裝 prismantis 和 cc-mod-image-view？** 如果你用 macOS 或 Linux，而且終端機支援 kitty 圖片，可以。tessera 是為其他情況而做的：Windows、中日韓文字、沒有圖片協定的終端機，以及長時間的 agent 執行。

## 致謝

回覆美化改編自 Nahum Litvin 的 [prismantis](https://github.com/NahumLitvin/prismantis)；貼圖快取的找法參考 gggodlin 的 [cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view)，它源自 Jarrod Watts 的 [claude-image-view](https://github.com/jarrodwatts/claude-image-view)；PNG 和 zip 解壓縮使用 [fflate](https://github.com/101arrowz/fflate)。皆為 MIT 授權，見 [NOTICE](NOTICE)。

## 參與

歡迎用中文或英文開 issue 和 PR。請先讀 [CONTRIBUTING.md](CONTRIBUTING.md)，並遵守[行為準則](CODE_OF_CONDUCT.md)。問題請到 [Discussions](https://github.com/OG-Matcha/tessera/discussions)（見 [SUPPORT.md](SUPPORT.md)），每個版本的變更記在 [CHANGELOG.md](CHANGELOG.md)。

## 授權

[MIT](LICENSE)
