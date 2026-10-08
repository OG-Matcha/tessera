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
    check: s => seen(s.reply, /tessera blocked|unquoted heredoc|heredoc delimiter is unquoted|1 failed · last: cat > a\.ts <<EOF/i),
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
        args: [...HAIKU, '--settings', JSON.stringify({ pluginConfigs: { 'tessera@tessera': { options: { guardGlossary: true } } } })],
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
    sessions: () => [{ args: HAIKU, steps: [{ type: 'Run this exact Bash command and nothing else: rm -rf wt' }, { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' }] }],
    check: (s, dir) => (existsSync(join(dir, 'shared', 'keep.txt')) ? seen(s.reply, /delete through a link|holds a junction or symlink|tessera (refused|blocked)|1 failed · last: rm -rf wt/i) : 'the delete went through the link: shared/keep.txt is gone'),
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
    name: 'agent-model-auto',
    prompts: true,
    sessions: () => [
      {
        args: [...HAIKU, '--settings', JSON.stringify({ pluginConfigs: { 'tessera@tessera': { options: { agentModel: 'auto' } } } })],
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
          { press: ['[ 展開 ]', '[ expand ]'] },
          { wait: 1_000, shot: 'expanded' },
        ],
      },
    ],
    // Folded, the edit shows a few of its lines; expanded, Claude Code draws all of them again.
    check: s => seen(s.reply, /more lines|行未顯示/) ?? seen(s.expanded, /\+item 24/),
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
]

