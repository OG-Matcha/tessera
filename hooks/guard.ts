export type Risk = 'tree-rewrite' | 'stage-all' | 'link-node-modules'

// One shell command line split at ;, &&, || and | so each git call is judged on its own.
const pieces = (command: string) => command.split(/;|&&|\|\||\||\n/).map(p => p.trim())

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
