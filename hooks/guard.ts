export type Risk = 'tree-rewrite' | 'stage-all' | 'link-node-modules'

// A heredoc: `<<` or `<<-`, a delimiter, quoted or not, and the body from the next line to the line that
// is the delimiter (a trailing \r allowed). `<<<` is a herestring and `<<` inside `$(( ))` a shift, not
// one. Several on one line take their bodies in order; a body with no end runs to the end of the text.
// `shell` is a body fed to a local shell (bash <<'EOF'), which is commands, not data.
type Heredoc = { quoted: boolean; bodyStart: number; bodyEnd: number; delimiterLine: number; shell: boolean }

const HEREDOC_START = /(?<![<$(])<<(?!<)(-?)\s*(["']?)([A-Za-z_][\w-]*)\2/g
const inArithmetic = (line: string, at: number) => /\$\(\((?![\s\S]*\)\))/.test(line.slice(0, at))
const LOCAL_SHELL = /(?:^|[;&|]\s*)(?:ba|z|da)?sh\b[^;&|]*$/

export function heredocs(command: string): Heredoc[] {
  const out: Heredoc[] = []
  const lines = command.split('\n')
  const offsets: number[] = []
  for (let o = 0, i = 0; i < lines.length; i++) {
    offsets.push(o)
    o += lines[i]!.length + 1
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const starts = [...line.matchAll(HEREDOC_START)].filter(m => !inArithmetic(line, m.index))
    let next = i + 1
    for (const m of starts) {
      const strip = m[1] === '-'
      const ends = (l: string) => (strip ? l.replace(/^\t+/, '') : l).replace(/\r$/, '') === m[3]
      let j = next
      while (j < lines.length && !ends(lines[j]!)) j++
      const bodyEnd = j < lines.length ? offsets[j]! + lines[j]!.length : command.length
      out.push({ quoted: m[2] !== '', bodyStart: Math.min(offsets[next] ?? command.length, command.length), bodyEnd, delimiterLine: j, shell: LOCAL_SHELL.test(line.slice(0, m.index)) })
      next = j + 1
    }
    if (starts.length > 0) i = next - 1
  }
  return out
}

// A heredoc's body is data (a commit message, a file), not commands, so it is left out before a line is
// split, unless a local shell reads it; the `<<` line itself stays.
const withoutHeredocs = (command: string): string => {
  let out = command
  for (const h of heredocs(command).filter(h => !h.shell).reverse()) out = `${out.slice(0, h.bodyStart)}${out.slice(h.bodyEnd)}`
  return out
}

// One shell command line split at ;, &&, || and | so each git call is judged on its own.
const pieces = (command: string) => withoutHeredocs(command).split(/;|&&|&|\|\||\||\n/).map(p => p.trim())

// git with the options that may come before its verb: the ones that take a value (-C <dir>, -c k=v,
// --git-dir <path>) and the flags (--no-pager, -P, --no-optional-locks, --bare).
const GIT_OPTIONS = String.raw`(?:(?:-[Cc]|--git-dir|--work-tree|--namespace|--exec-path|--config-env)\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S*)?|-[A-Za-z])\s+`
const GIT = new RegExp(String.raw`^(?:git|git\.exe)\s+(?:${GIT_OPTIONS})*([^-\s]\S*)(.*)$`, 'i')

export function shellRisks(command: string): Risk[] {
  const risks = new Set<Risk>()
  for (const piece of pieces(command)) {
    const git = GIT.exec(piece)
    if (git) {
      const verb = (git[1] ?? '').toLowerCase()
      const rest = git[2] ?? ''
      if (verb === 'checkout' || verb === 'switch' || verb === 'reset' || verb === 'restore') risks.add('tree-rewrite')
      if (verb === 'stash' && !/^\s+(list|show)\b/.test(rest)) risks.add('tree-rewrite')
      if (verb === 'clean' && /\s-\w*f/.test(rest)) risks.add('tree-rewrite')
      if (verb === 'add' && /\s(-A|--all|\.)(\s|$)/.test(rest)) risks.add('stage-all')
      if (verb === 'commit' && rest.split(/\s+/).some(w => w === '--all' || /^-[a-zA-Z]*a/.test(w))) risks.add('stage-all')
    }
    const links = /\bmklink\s+\/[JD]\b|\bNew-Item\b.*-ItemType\s+['"]?(Junction|SymbolicLink)|\bln\s+-\w*s/i.test(piece)
    if (links && /node_modules/i.test(piece)) risks.add('link-node-modules')
  }
  return [...risks]
}

// A force push to the default branch rewrites history that others and CI build on. Each forced push
// names its destination branches; undefined stands for the current branch, which a push with no refspec
// (or HEAD) sends.
export function forcePushes(command: string): (string | undefined)[] {
  const found: (string | undefined)[] = []
  for (const piece of pieces(command)) {
    const git = GIT.exec(piece)
    if (git?.[1]?.toLowerCase() !== 'push') continue
    const words = (git[2] ?? '').trim().split(/\s+/).filter(w => w !== '')
    const forced = words.some(w => /^(--force(-with-lease)?(=.*)?|-[a-zA-Z]*f[a-zA-Z]*)$/.test(w))
    const refspecs = words.filter(w => !w.startsWith('-')).slice(1)
    for (const spec of refspecs) {
      if (!forced && !spec.startsWith('+')) continue
      const dest = spec.replace(/^\+/, '').split(':').pop() ?? ''
      found.push(dest === 'HEAD' || dest === '' ? undefined : dest)
    }
    if (forced && refspecs.length === 0) found.push(undefined)
  }
  return found
}

// Git calls that throw away uncommitted work: reset --hard (every tracked change), checkout or restore of
// paths, or checkout -f (unstaged changes to them), clean -f (untracked files). A plain checkout of a
// branch is left out: git itself refuses it when it would overwrite changes.
export type Discard = { verb: 'reset' | 'checkout' | 'restore' | 'clean'; args: string[] }

export function discards(command: string): Discard[] {
  const found: Discard[] = []
  for (const piece of pieces(command)) {
    const git = GIT.exec(piece)
    const verb = git?.[1]?.toLowerCase()
    const words = (git?.[2] ?? '').trim().split(/\s+/).filter(w => w !== '')
    if (verb === 'reset' && words.includes('--hard')) found.push({ verb, args: [] })
    if (verb === 'checkout') {
      const dashes = words.indexOf('--')
      const paths = dashes === -1 ? words.filter(w => w === '.') : words.slice(dashes + 1)
      if (dashes !== -1 || paths.length > 0 || words.some(w => /^(-f|--force)$/.test(w))) found.push({ verb, args: paths })
    }
    if (verb === 'restore' && (!words.some(w => /^(-S|--staged)$/.test(w)) || words.some(w => /^(-W|--worktree)$/.test(w))))
      found.push({ verb, args: words.filter(w => !w.startsWith('-')) })
    if (verb === 'clean' && words.some(w => /^(-\w*f\w*|--force)$/.test(w))) found.push({ verb, args: words.filter(w => w.startsWith('-')) })
  }
  return found
}

export const isDefaultBranch =(branch: string) => /^(refs\/heads\/)?(main|master)$/.test(branch)

export const isAbsolute = (path: string) => /^([a-z]:)?[\\/]/i.test(path)

// A path under base, with `.` and `..` folded, one slash style and a lower-case drive letter, so two
// spellings of one place compare equal: git prints --git-dir absolute and --git-common-dir relative
// when run from a subdirectory.
export function resolvePath(base: string, path: string): string {
  const parts: string[] = []
  for (const part of (isAbsolute(path) ? path : `${base}/${path}`).replace(/\\/g, '/').split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && (part !== '' || parts.length === 0)) parts.push(part)
  }
  return parts.join('/').replace(/^[a-z]:/i, drive => drive.toLowerCase())
}

// A heredoc with an unquoted delimiter is expanded before it is written: ${x}, $(cmd) and backticks are
// replaced and \\ becomes \, so code written through one loses its template literals and escapes.
const EXPANDED = /\$\{|\$\(|`|\\[\\$`]/

export function expandedHeredoc(command: string): string | undefined {
  const lines = command.split('\n')
  for (const h of heredocs(command)) {
    if (h.quoted) continue
    const body = command.slice(h.bodyStart, h.delimiterLine < lines.length ? h.bodyEnd - lines[h.delimiterLine]!.length : h.bodyEnd)
    const hit = EXPANDED.exec(body)
    if (hit) return hit[0]
  }
  return undefined
}

// The git -C directory, after any other option before the verb; -c is a config value, so the case counts.
const GIT_DASH_C = new RegExp(String.raw`\b[gG]it(?:\.exe)?\s+(?:${GIT_OPTIONS.replace('-[Cc]', '-c')})*-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)`)

export function commandDir(command: string): string | undefined {
  const unquote = (s: string) => s.replace(/^["']|["']$/g, '')
  const cd = /^\s*(?:cd|Set-Location|sl|pushd)\s+(?:\/d\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)/i.exec(command)
  if (cd?.[1]) return unquote(cd[1])
  const dashC = GIT_DASH_C.exec(command)
  return dashC?.[1] ? unquote(dashC[1]) : undefined
}

// A path as Git Bash on Windows spells it (/c/w, ~/w) as the file system does: C:/w, <home>/w.
export const hostPath = (path: string, home: string | undefined, windows: boolean): string => {
  const expanded = home !== undefined ? path.replace(/^~(?=[\\/]|$)/, home) : path
  return windows ? expanded.replace(/^\/([a-zA-Z])(?=\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:`) : expanded
}

const QUOTE = 10
const flat = (s: string) => [...s.replace(/\s+/g, ' ')]

export function quotesUser(script: string, userPrompts: string[]): boolean {
  const chars = flat(script)
  const grams = new Set<string>()
  for (let i = 0; i + QUOTE <= chars.length; i++) grams.add(chars.slice(i, i + QUOTE).join(''))
  return userPrompts.some(p => {
    const words = flat(p)
    for (let i = 0; i + QUOTE <= words.length; i++) {
      const gram = words.slice(i, i + QUOTE).join('')
      if (gram.trim().length === QUOTE && grams.has(gram)) return true
    }
    return false
  })
}

// A Workflow script whose agent() calls name no model runs them all on the session's model.
export const scriptNamesModel = (script: string) => !/\bagent\s*\(/.test(script) || /\bmodel\s*:/.test(script)

const words = (piece: string) => [...piece.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')

// The paths a command deletes recursively: rm -r, Remove-Item -Recurse, rmdir /s, rd /s and git worktree remove.
export function recursiveDeletes(command: string): string[] {
  const targets: string[] = []
  for (const piece of pieces(command)) {
    let [verb = '', ...args] = words(piece)
    if (/^cmd(\.exe)?$/i.test(verb) && /^\/c$/i.test(args[0] ?? '')) [verb = '', ...args] = args.slice(1)
    const name = verb.toLowerCase().replace(/\.exe$/, '')
    const plain = args.filter(a => !a.startsWith('-') && !/^\/[a-z]$/i.test(a))
    if (name === 'rm' && args.some(a => /^-\w*r/i.test(a) || a === '--recursive' || /^-Recurse$/i.test(a))) targets.push(...plain)
    else if ((name === 'remove-item' || name === 'ri' || name === 'rd' || name === 'rmdir' || name === 'del') && args.some(a => /^-Recurse$/i.test(a) || /^\/s$/i.test(a))) {
      const named = args.findIndex(a => /^-(Literal)?Path$/i.test(a))
      targets.push(...(named >= 0 && args[named + 1] ? [args[named + 1] as string] : plain))
    } else if (name === 'git' && args[0] === 'worktree' && args[1] === 'remove') targets.push(...plain.slice(2))
  }
  // The home variables are read as ~, which hostPath expands; any other variable makes a target unknowable.
  return targets.map(t => t.replace(/^(?:\$HOME|\$\{HOME\}|%USERPROFILE%|\$env:USERPROFILE)(?=[\\/]|$)/i, '~')).filter(t => t !== '' && !/[$*?`]/.test(t))
}

// A recursive delete of one of these has no good reading: the file system's root, a drive, the home
// directory, or the directory the session works in or one above it.
export function rootLike(path: string, cwd: string, home: string | undefined): boolean {
  const norm = (p: string) => resolvePath('', p.replace(/^([a-zA-Z]:)$/, '$1/')).replace(/\/+$/, '')
  const target = norm(path)
  if (target === '' || /^[a-z]:$/.test(target)) return true
  if (home !== undefined && target === norm(home)) return true
  const work = norm(cwd)
  return target === work || work.startsWith(`${target}/`)
}

// Hangul, kana, CJK ideographs and their punctuation: scripts a model should write as themselves.
const CJK_RANGES: [number, number][] = [
  [0x1100, 0x11ff],
  [0x3000, 0x30ff],
  [0x3130, 0x318f],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
]
const CJK = (code: number) => CJK_RANGES.some(([from, to]) => code >= from && code <= to)

const ESCAPE = /\\u([0-9a-fA-F]{4})/g
const hex = (code: number) => code.toString(16).padStart(4, '0')
const LITERAL_CJK = new RegExp(`[${CJK_RANGES.map(([from, to]) => `\\u${hex(from)}-\\u${hex(to)}`).join('')}]`)

function cjkEscape(text: string): string | undefined {
  for (const m of text.matchAll(ESCAPE)) if (CJK(parseInt(m[1] ?? '', 16))) return m[0]
  return undefined
}

export const isProse = (path: string) => /\.(md|mdx|markdown|txt|rst|adoc|org)$/i.test(path)

// Text a tool call writes where a CJK escape is a mistake rather than code: anything in a prompt-like
// parameter, and in files only for prose files or when the same text also holds literal CJK.
const texts = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(texts) : v !== null && typeof v === 'object' ? Object.values(v).flatMap(texts) : [])

export function writtenFile(tool: string, input: Record<string, unknown>): { path: string; texts: string[] } | undefined {
  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit' && tool !== 'NotebookEdit') return undefined
  return {
    path: String(input.file_path ?? input.notebook_path ?? ''),
    texts: [input.content, input.new_string, input.new_source, ...(Array.isArray(input.edits) ? input.edits.map(e => (e as { new_string?: unknown }).new_string) : [])].flatMap(texts),
  }
}

export function misEscapedCjk(tool: string, input: Record<string, unknown>): string | undefined {
  const file = writtenFile(tool, input)
  if (file !== undefined) return file.texts.map(t => (isProse(file.path) || LITERAL_CJK.test(t) ? cjkEscape(t) : undefined)).find(Boolean)
  if (tool === 'AskUserQuestion' || tool === 'TodoWrite' || tool === 'TaskCreate' || tool === 'TaskUpdate') return texts(input).map(cjkEscape).find(Boolean)
  return undefined
}
