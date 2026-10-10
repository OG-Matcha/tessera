// Each scenario sets up a throwaway repository, drives one or more real sessions, and names what it saw
// when the feature did not show. Prompting scenarios use Haiku to keep the run cheap.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir, platform } from 'node:os'

import { ALT_V, PASTE, clipboardImage, clipboardText } from './drive.mjs'

const HAIKU = ['--model', 'haiku']
const REPLY = 90_000
const tail = text => (text ?? '').split('\n').filter(l => l.trim()).slice(-8).join('\n')
const seen = (shot, pattern) => (pattern.test(shot?.text ?? '') ? undefined : `not on screen: ${pattern}\n${tail(shot?.text)}`)

// Claude Code keeps each session's transcript under ~/.claude/projects/<cwd with non-alphanumerics as ->.
const projectDir = dir => join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects', dir.replace(/[^A-Za-z0-9]/g, '-'))
const transcripts = (dir, pattern) =>
  existsSync(projectDir(dir)) ? readdirSync(projectDir(dir), { recursive: true }).map(String).filter(f => pattern.test(f)).map(f => readFileSync(join(projectDir(dir), f), 'utf8')) : []

const transcriptText = dir => transcripts(dir, /^[^\\/]+\.jsonl$/).join('\n')

function subagentModels(dir) {
  return [...new Set(transcripts(dir, /subagents[\\/].*\.jsonl$/).flatMap(text => [...text.matchAll(/"model":"(claude-[^"]+)"/g)].map(m => m[1])))]
}

const thirtyLines = ['錯誤：無法連線到資料庫', '  at connect (db.ts:12:3)', ...Array.from({ length: 28 }, (_, i) => `第 ${i + 3} 行 log`)].join('\n')

export const scenarios = [
  {
    name: 'typeahead',
    sessions: () => [{ steps: [{ type: '/tessera s' }, { wait: 2_000, shot: 'menu' }] }],
    check: s => seen(s.menu, /setup/),
  },
  {
    name: 'setup',
    // The first command the README tells people to run.
    sessions: () => [{ steps: [{ type: '/tessera setup' }, { key: '\r', until: /tessera features|tessera 功能/, timeoutMs: 15_000, shot: 'pane' }] }],
    check: s => seen(s.pane, /(tessera features|tessera 功能)[\s\S]*[☑☐]/),
  },
  {
    name: 'peek',
    setup: dir => writeFileSync(join(dir, 'notes.md'), '# Release notes\n\n| Version | Change |\n|---|---|\n| 0.6 | folded diffs |\n'),
    sessions: () => [{ steps: [{ type: '/tessera peek notes.md' }, { key: '\r', until: /Release notes/, timeoutMs: 15_000, shot: 'peek' }] }],
    // The heading draws as a heading: Claude Code prefixes a plugin's answer with "tessera: ".
    check: s => (/###/.test(s.peek?.text ?? '') ? 'the "### notes.md" heading drew as text' : seen(s.peek, /Release notes[\s\S]*│[^\n]*folded diffs/)),
  },
  {
    name: 'feedback-inbox',
    prompts: true,
    sessions: () => [
      {
        args: [...HAIKU, '--settings', JSON.stringify({ pluginConfigs: { 'tessera@og-matcha': { options: { feedbackInbox: true } } } })],
        steps: [
          { key: PASTE('22:55 Amy 登入按鈕按了沒反應\n22:56 Ben 匯出的 CSV 中文變亂碼') },
          { type: ' Reply with one word: ok' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY },
          { wait: 1_000 },
          { type: '/tessera inbox' },
          // The pasted log is on screen too, so the wait is for a row of the inbox table.
          { key: '\r', until: /│\s*2\s*│[^\n]*Ben/, timeoutMs: 15_000, shot: 'inbox' },
        ],
      },
    ],
    // Columns line up: the number, then the time, then who.
    check: s => seen(s.inbox, /│\s*1\s*│\s*22:55\s*│\s*Amy\s*│[^\n]*登入按鈕[\s\S]*│\s*2\s*│\s*22:56\s*│\s*Ben\s*│/),
  },
  {
    name: 'paste-image',
    clipboard: true,
    sessions: (_, repo) => [{ steps: [{ run: () => clipboardImage(join(repo, 'docs', 'social-preview.png')) }, { key: ALT_V, until: /\[ (original|原圖) \]/, timeoutMs: 15_000, shot: 'band' }] }],
    check: s => seen(s.band, /\[ (original|原圖) \]/),
  },
  {
    name: 'paste-text',
    clipboard: true,
    setup: dir => writeFileSync(join(dir, 'paste.txt'), thirtyLines + '\n'),
    sessions: dir => [{ steps: [{ run: () => clipboardText(join(dir, 'paste.txt')) }, { key: PASTE(thirtyLines), until: /Pasted text #1 · 30 lines|貼上的文字 #1 · 30 行/, timeoutMs: 15_000, shot: 'band' }] }],
    check: s => seen(s.band, /(Pasted text #1 · 30 lines|貼上的文字 #1 · 30 行)[\s\S]*錯誤：無法連線到資料庫/),
  },
  {
    name: 'reply-language',
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [{ type: '用一句話解釋這個錯誤：`TypeError: Cannot read properties of undefined (reading map)`' }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' }],
      },
    ],
    check: s => seen(s.reply, /● [^\n]*[一-鿿]/),
  },
  {
    name: 'reply-language-drift',
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: '用一句話說明什麼是 HTTP 快取' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY },
          { type: '下一題請只用英文回答：CDN 是什麼？一句話就好' },
          { key: '\r', wait: 2_000, until: /✻ \w+ for[\s\S]*✻ \w+ for/, timeoutMs: REPLY },
          { type: '再用一句話說明 ETag' },
          { key: '\r', wait: 2_000, until: /(✻ \w+ for[\s\S]*){3}/, timeoutMs: REPLY, shot: 'reply' },
          { wait: 2_000 },
        ],
      },
    ],
    // The note is model-only context, so the transcript is where it shows: once at the start, and once
    // more after the English reply.
    check: (_, dir) => {
      const notes = transcriptText(dir).split('\n').filter(line => line.includes('hook_additional_context') && line.includes('Reply in Traditional Chinese')).length
      return notes >= 2 ? undefined : `the reply note reached the model ${notes} time(s), expected 2`
    },
  },
  {
    name: 'heredoc-guard',
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Run this Bash command exactly as written, character for character, then stop: ' },
          { key: PASTE('cat > a.ts <<EOF\nconst s = `${name}`\nEOF'), wait: 1_000 },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' },
        ],
      },
    ],
    // The refusal sits in a collapsed tool row; the row's failed count, or Claude retelling it, shows it.
    check: s => seen(s.reply, /tessera blocked|unquoted heredoc|heredoc delimiter is unquoted|(1 failed · last|1 個失敗 · 最後)[:：] ?cat > a\.ts <<EOF/i),
  },
  {
    name: 'zh-tw-guard',
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [{ type: '請用 Write 工具建立 notes.md，內容照抄這段：`这个服务器的默认端口是 8080`，不要做別的事。' }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' }],
      },
    ],
    check: s => seen(s.reply, /zh-TW wording|Simplified characters or zh-CN terms|这→這/),
  },
  {
    name: 'glossary-guard',
    prompts: true,
    setup: dir => writeFileSync(join(dir, 'CLAUDE.md'), '# Demo\n\n| 用語 | 避免 |\n|---|---|\n| 全文完 | 通關 |\n'),
    sessions: () => [
      {
        args: [...HAIKU, '--settings', JSON.stringify({ pluginConfigs: { 'tessera@og-matcha': { options: { guardGlossary: true } } } })],
        steps: [{ type: 'Use the Write tool to create end.ts containing exactly: export const TITLE = "通關" — nothing else.' }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' }],
      },
    ],
    check: s => seen(s.reply, /project glossary|通關→全文完/),
  },
  {
    name: 'link-delete-guard',
    prompts: true,
    setup: dir => {
      mkdirSync(join(dir, 'shared'))
      writeFileSync(join(dir, 'shared', 'keep.txt'), 'keep')
      mkdirSync(join(dir, 'wt'))
      if (platform() === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', join(dir, 'wt', 'node_modules'), join(dir, 'shared')])
      else execFileSync('ln', ['-s', join(dir, 'shared'), join(dir, 'wt', 'node_modules')])
    },
    // rmdir /s and git on Windows follow a junction inside the tree; rm elsewhere follows only a link it is given.
    sessions: () => [{ args: HAIKU, steps: [{ type: `Run this exact Bash command and nothing else: rm -rf ${platform() === 'win32' ? 'wt' : 'wt/node_modules/'}` }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' }] }],
    check: (s, dir) => (existsSync(join(dir, 'shared', 'keep.txt')) ? seen(s.reply, /delete through a link|holds a junction or symlink|tessera (refused|blocked)|(1 failed · last|1 個失敗 · 最後)[:：] ?rm -rf wt/i) : 'the delete went through the link: shared/keep.txt is gone'),
  },
  {
    name: 'force-push-guard',
    prompts: true,
    // The throwaway repository has no remote, so a push that gets through goes nowhere.
    sessions: () => [{ args: HAIKU, steps: [{ type: 'Run this exact Bash command once and nothing else: git push --force origin main' }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' }] }],
    check: s => seen(s.reply, /force-pushes to main|force push|強制推送|tessera (refused|blocked)|(1 failed · last|1 個失敗 · 最後)[:：] ?git push --force/i),
  },
  {
    name: 'discard-guard',
    prompts: true,
    // A committed file with an uncommitted edit, which the checkout would throw away.
    setup: dir => {
      writeFileSync(join(dir, 'notes.txt'), 'first\n')
      execFileSync('git', ['add', 'notes.txt'], { cwd: dir })
      execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', 'commit', '-qm', 'notes'], { cwd: dir })
      writeFileSync(join(dir, 'notes.txt'), 'first\nunsaved edit\n')
    },
    sessions: () => [{ args: HAIKU, steps: [{ type: 'Run this exact Bash command once and nothing else: git checkout -- notes.txt' }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' }] }],
    check: s => seen(s.reply, /throws away uncommitted|uncommitted (work|changes)|未提交|(1 failed · last|1 個失敗 · 最後)[:：] ?git checkout/i),
  },
  {
    name: 'copy-reply',
    // The reply button shows on replies of more than one block, so the reply is asked for in two.
    prompts: true,
    clipboard: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Reply with exactly two paragraphs and nothing else. First: hello from tessera e2e. Second: copy check.' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' },
          { copyReply: true },
        ],
      },
    ],
    check: s => (/hello from tessera e2e/i.test(s.clipboard ?? '') ? undefined : `clipboard holds: ${JSON.stringify((s.clipboard ?? '').slice(0, 80))}`),
  },
  {
    name: 'render',
    // The main feature: a table, a mermaid flowchart and a code block drawn by tessera. Claude Code alone
    // shows the mermaid source as text and labels no code block. The prompt spells no arrow, so any --> on
    // screen is the reply's.
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          {
            type: 'Reply with only this markdown, verbatim, no other text: a table with header | Tier | Hits | and rows | L1 | 90 | and | L2 | 7 |, then a mermaid code block: a flowchart LR with one arrow from node A[Cache] to node B[Store], then a ts code block holding "const hit = true".',
          },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, wait: 2_000, shot: 'reply' },
        ],
      },
    ],
    check: s =>
      seen(s.reply, /┌[─┬]+┐[\s\S]*Tier[\s\S]*L2/) ??
      seen(s.reply, /Cache ├─*►│ Store/) ??
      seen(s.reply, /── ts[\s\S]*const hit = true/) ??
      (/-->/.test(s.reply?.text ?? '') ? `mermaid source left as text\n${tail(s.reply?.text)}` : undefined),
  },
  {
    name: 'copy-list',
    // A list's copy button sits beside its first item, not on a line of its own above it.
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Reply with one sentence "Here is the plan:" and then a markdown numbered list of three items: build, test, ship. Nothing else.' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' },
        ],
      },
    ],
    check: s => seen(s.reply, /1\. build\s+\[ ⧉ (copy|複製) \]/i),
  },
  {
    name: 'agent-model-auto',
    prompts: true,
    sessions: () => [
      {
        args: [...HAIKU, '--settings', JSON.stringify({ pluginConfigs: { 'tessera@og-matcha': { options: { agentModel: 'auto' } } } })],
        steps: [
          {
            type: 'Use the Agent tool once, general-purpose type, no model parameter, run in the foreground, with this exact prompt: "Hard design review: find the race conditions in a distributed lock built on Redis SETNX with expiry, and the failure modes under clock drift. For this test, reply with only OK." Then stop.',
          },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' },
          { wait: 5_000 },
        ],
      },
    ],
    // The session runs on Haiku, so a subagent that ran on another model got it from tessera.
    check: (_, dir) => {
      const models = subagentModels(dir)
      return models.some(m => !/haiku/i.test(m)) ? undefined : `subagent models: ${models.join(', ') || 'none found'}`
    },
  },
  {
    name: 'carry-over',
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Use TaskCreate to add three tasks: "write the login page", "add input validation", "update README". Then mark the first completed with TaskUpdate. Do nothing else.' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'first' },
          { type: '/exit' },
          { key: '\r', wait: 3_000 },
        ],
      },
      { steps: [{ until: /unfinished from your last session|項沒完成/, timeoutMs: 15_000, shot: 'next' }] },
    ],
    check: s => seen(s.next, /(2 unfinished from your last session here|上次在這個專案還有 2 項沒完成)[\s\S]*add input validation/),
  },
  // Token cost: the first request's input tokens with features on and off, for the README table. Run
  // with CLAUDE_CODE_ENABLE_TODO_TOOLS unset: node e2e/run.mjs cost-all cost-no-hints cost-no-language cost-none
  ...[
    ['cost-all', {}],
    ['cost-no-hints', { diagramHints: false }],
    ['cost-no-language', { replyLanguage: 'off' }],
    ['cost-none', { diagramHints: false, replyLanguage: 'off' }],
  ].map(([name, options]) => ({
    name,
    manual: true,
    prompts: true,
    sessions: () => [
      {
        args: [...HAIKU, '--settings', JSON.stringify({ pluginConfigs: { 'tessera@og-matcha': { options } } })],
        steps: [{ type: '用一句話說明什麼是快取' }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY }, { wait: 2_000 }],
      },
    ],
    check: (_, dir) => {
      const usage = transcriptText(dir).match(/"usage":\{"input_tokens":(\d+),"cache_creation_input_tokens":(\d+),"cache_read_input_tokens":(\d+)/)
      return `input ${usage ? Number(usage[1]) + Number(usage[2]) + Number(usage[3]) : 'none'}`
    },
  })),
  {
    name: 'perf',
    manual: true,
    prompts: true,
    // Render timings: node e2e/run.mjs perf, then read the "tessera@og-matcha ... settled" lines. Measured
    // 2026-10-09: after startup the band above the prompt draws in 8-64 ms. tessera's session.start takes
    // 1-1.8 s, but the prompt takes input before session.start is even raised (2.0-2.3 s from trust with
    // tessera, 2.1-2.9 s without), so nobody waits on it. The 3 s on submit is the settings hooks. The long reply
    // (six tables, two flowcharts, a bar chart, six code blocks) drew 4 times while streaming, 47 ms on
    // average and 80 ms at most, so parsed replies are not cached.
    sessions: () => [
      {
        args: [...HAIKU, '--debug-file', join(homedir(), '.claude', 'tessera-perf.log')],
        steps: [
          ...'幫我寫一個表格比較三種快取策略'.split('').map(ch => ({ key: ch, wait: 150 })),
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY },
          { wait: 2_000 },
          // A long reply: the most a render has to draw at once.
          { type: 'Write a long reference reply: six markdown tables of eight rows each, two mermaid flowcharts of eight nodes, one xychart-beta bar chart, and six fenced code blocks of twenty lines in different languages. No tools.' },
          // The first reply's "✻ … for" line is still on screen, so the long one is waited out instead.
          { key: '\r', wait: 90_000, shot: 'long' },
        ],
      },
    ],
    check: () => 'measured',
  },
  {
    name: 'update-offer',
    // A GitHub install of tessera with auto-update off.
    sessions: () => [
      {
        args: ['--settings', JSON.stringify({ extraKnownMarketplaces: { 'og-matcha': { source: { source: 'github', repo: 'OG-Matcha/tessera' } } } })],
        steps: [{ until: /auto-update is off|沒開自動更新/, timeoutMs: 20_000, shot: 'band' }],
      },
    ],
    check: s => seen(s.band, /(auto-update is off|沒開自動更新)[\s\S]*(open \/plugin|打開 \/plugin)[\s\S]*Marketplaces → og-matcha/),
  },
  {
    name: 'moved-install',
    // A GitHub install under the marketplace's old name, which no longer updates.
    sessions: () => [
      {
        args: ['--settings', JSON.stringify({ extraKnownMarketplaces: { tessera: { source: { source: 'github', repo: 'OG-Matcha/tessera' }, autoUpdate: true } } })],
        steps: [{ until: /moved to tessera@og-matcha|改為 tessera@og-matcha/, timeoutMs: 20_000, shot: 'band' }],
      },
    ],
    check: s => seen(s.band, /(moved to tessera@og-matcha|改為 tessera@og-matcha)[\s\S]*(copy the commands|複製指令)/),
  },
  {
    name: 'fold-diff',
    prompts: true,
    setup: dir => writeFileSync(join(dir, 'list.txt'), Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n') + '\n'),
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Use the Edit tool once on list.txt: replace the lines "line 5" through "line 24" with "item 5" through "item 24". Do nothing else.' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' },
          // ctrl+o draws the transcript in full, the diff included, and closing it folds the diff again.
          { key: '\x0f', wait: 1_500, shot: 'expanded' },
          { key: '\x0f', wait: 1_500, shot: 'folded' },
          { press: ['[ 展開 ]', '[ expand ]'] },
          { wait: 1_000, shot: 'unfolded' },
        ],
      },
    ],
    // Folded, the edit shows a few of its lines; expanded, Claude Code draws all of them again.
    check: s => seen(s.reply, /more lines|行未顯示/) ?? seen(s.expanded, /\+item 24/) ?? seen(s.folded, /more lines|行未顯示/) ?? seen(s.unfolded, /\+item 24/),
  },
  {
    name: 'carry-over-reload',
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Use TaskCreate to add two tasks: "write the login page", "add input validation". Do nothing else.' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY },
          { type: '/reload-plugins' },
          { key: '\r', until: /Reloaded:/, timeoutMs: 30_000 },
          { type: 'Use TaskUpdate to mark the task "write the login page" completed. Do nothing else.' },
          { key: '\r', wait: 2_000, until: /✻ \w+ for[\s\S]*✻ \w+ for/, timeoutMs: REPLY, shot: 'updated' },
          { type: '/exit' },
          { key: '\r', wait: 3_000 },
        ],
      },
      { steps: [{ until: /unfinished from your last session|項沒完成/, timeoutMs: 15_000, shot: 'next' }] },
    ],
    check: s => seen(s.next, /(1 unfinished from your last session here|上次在這個專案還有 1 項沒完成)[\s\S]*add input validation/),
  },
  {
    name: 'carry-over-clear',
    prompts: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Use TaskCreate to add two tasks: "write the login page", "add input validation". Do nothing else.' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'first' },
          { wait: 2_000 },
          { type: '/clear' },
          { key: '\r', until: /unfinished from your last session|項沒完成/, timeoutMs: 15_000, shot: 'cleared' },
        ],
      },
    ],
    check: s => seen(s.cleared, /(2 unfinished from your last session here|上次在這個專案還有 2 項沒完成)[\s\S]*add input validation/),
  },
  {
    name: 'background-watch',
    prompts: true,
    // A backgrounded sleep writes nothing; with the quiet time at a minute the row shows on the first check.
    sessions: () => [
      {
        args: [...HAIKU, '--settings', JSON.stringify({ pluginConfigs: { 'tessera@og-matcha': { options: { backgroundQuietMinutes: 1 } } } })],
        steps: [
          { type: 'Use the Bash tool with run_in_background set to true to run exactly this command, then stop and wait: sleep 300' },
          { key: '\r', until: /written nothing for|沒有輸出/, timeoutMs: 200_000, shot: 'band' },
        ],
      },
    ],
    check: s => seen(s.band, /(written nothing for \d+ min|\d+ 分鐘沒有輸出)[\s\S]*(ask Claude|問 Claude)[\s\S]*sleep 300/),
  },
]

