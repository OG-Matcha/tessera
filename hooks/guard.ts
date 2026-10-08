export type Risk = 'tree-rewrite' | 'stage-all' | 'link-node-modules'

// One shell command line split at ;, &&, || and | so each git call is judged on its own.
const pieces = (command: string) => command.split(/;|&&|&|\|\||\||\n/).map(p => p.trim())

const GIT = /^(?:git|git\.exe)\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)\s+)?(\S+)(.*)$/i

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
      if (verb === 'commit' && /\s-\w*a/.test(rest)) risks.add('stage-all')
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

export const isDefaultBranch = (branch: string) => /^(refs\/heads\/)?(main|master)$/.test(branch)

// A heredoc with an unquoted delimiter is expanded before it is written: ${x}, $(cmd) and backticks are
// replaced and \\ becomes \, so code written through one loses its template literals and escapes.
const HEREDOC = /<<(-?)\s*(["']?)([A-Za-z_][\w-]*)\2/g
const EXPANDED = /\$\{|\$\(|`|\\[\\$`]/

export function expandedHeredoc(command: string): string | undefined {
  for (const m of command.matchAll(HEREDOC)) {
    if (m[2] !== '') continue
    const start = command.indexOf('\n', m.index)
    if (start === -1) continue
    const lines = command.slice(start + 1).split('\n')
    const end = lines.findIndex(l => (m[1] === '-' ? l.replace(/^\t+/, '') : l) === m[3])
    const hit = EXPANDED.exec((end === -1 ? lines : lines.slice(0, end)).join('\n'))
    if (hit) return hit[0]
  }
  return undefined
}

export function commandDir(command: string): string | undefined {
  const unquote = (s: string) => s.replace(/^["']|["']$/g, '')
  const cd = /^\s*(?:cd|Set-Location|sl|pushd)\s+(?:\/d\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)/i.exec(command)
  if (cd?.[1]) return unquote(cd[1])
  const dashC = /\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)/i.exec(command)
  return dashC?.[1] ? unquote(dashC[1]) : undefined
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
  return targets.filter(t => t !== '' && !/[$*?`]/.test(t))
}

// Hangul, kana, CJK ideographs and their punctuation: scripts a model should write as themselves.
const CJK = (code: number) =>
  (code >= 0x1100 && code <= 0x11ff) ||
  (code >= 0x3000 && code <= 0x30ff) ||
  (code >= 0x3130 && code <= 0x318f) ||
  (code >= 0x3400 && code <= 0x4dbf) ||
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xff00 && code <= 0xffef)

const ESCAPE = /\\u([0-9a-fA-F]{4})/g
const LITERAL_CJK = /[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7a3]/

function cjkEscape(text: string): string | undefined {
  for (const m of text.matchAll(ESCAPE)) if (CJK(parseInt(m[1] ?? '', 16))) return m[0]
  return undefined
}

const PROSE = /\.(md|mdx|markdown|txt|rst|adoc|org)$/i

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
  if (file !== undefined) return file.texts.map(t => (PROSE.test(file.path) || LITERAL_CJK.test(t) ? cjkEscape(t) : undefined)).find(Boolean)
  if (tool === 'AskUserQuestion' || tool === 'TodoWrite' || tool === 'TaskCreate' || tool === 'TaskUpdate') return texts(input).map(cjkEscape).find(Boolean)
  return undefined
}
