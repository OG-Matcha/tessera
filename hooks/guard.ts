export type Risk = 'tree-rewrite' | 'stage-all' | 'link-node-modules'

// One shell command line split at ;, &&, || and | so each git call is judged on its own.
const pieces = (command: string) => command.split(/;|&&|&|\|\||\||\n/).map(p => p.trim())

const GIT = /^(?:git|git\.exe)\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)\s+)?(\S+)(.*)$/i

// Commands that rewrite the shared working tree or index, or link node_modules where a recursive delete can follow it.
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

// The directory a command runs git in: its -C path, or the target of a leading cd / Set-Location.
export function commandDir(command: string): string | undefined {
  const unquote = (s: string) => s.replace(/^["']|["']$/g, '')
  const cd = /^\s*(?:cd|Set-Location|sl|pushd)\s+(?:\/d\s+)?("[^"]+"|'[^']+'|[^\s;&|]+)/i.exec(command)
  if (cd?.[1]) return unquote(cd[1])
  const dashC = /\bgit\s+-C\s+("[^"]+"|'[^']+'|[^\s;&|]+)/i.exec(command)
  return dashC?.[1] ? unquote(dashC[1]) : undefined
}

const QUOTE = 10
const flat = (s: string) => [...s.replace(/\s+/g, ' ')]

// Whether the script carries the user's own words: any run of QUOTE characters from one of their prompts, verbatim.
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

// Splits one command into words, keeping quoted runs whole and dropping the quotes.
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
