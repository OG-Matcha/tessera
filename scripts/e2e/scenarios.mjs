// Each scenario sets up a throwaway repository, drives one or more real sessions, and names what it saw
// when the feature did not show. Prompting scenarios use Haiku to keep the run cheap.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { platform } from 'node:os'

import { ALT_V, PASTE, clipboardImage, clipboardText } from './drive.mjs'

const HAIKU = ['--model', 'haiku']
const REPLY = 90_000
const tail = text => (text ?? '').split('\n').filter(l => l.trim()).slice(-8).join('\n')
const seen = (shot, pattern) => (pattern.test(shot?.text ?? '') ? undefined : `not on screen: ${pattern}\n${tail(shot?.text)}`)

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
        args: HAIKU,
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
    check: (s, dir) => (existsSync(join(dir, 'shared', 'keep.txt')) ? seen(s.reply, /delete through a link|holds a junction or symlink/) : 'the delete went through the link: shared/keep.txt is gone'),
  },
  {
    name: 'copy-reply',
    prompts: true,
    clipboard: true,
    sessions: () => [
      {
        args: HAIKU,
        steps: [
          { type: 'Reply with exactly this line and nothing else: hello from tessera e2e' },
          { key: '\r', until: /✻ \w+ for/, timeoutMs: REPLY, shot: 'reply' },
          { copyReply: true },
        ],
      },
    ],
    check: s => (s.clipboard?.includes('hello from tessera e2e') ? undefined : `clipboard holds: ${JSON.stringify((s.clipboard ?? '').slice(0, 80))}`),
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
]

