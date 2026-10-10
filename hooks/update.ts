// Claude Code updates a third-party marketplace only when the person turns auto-update on for it, so an
// install from GitHub stays on its first version. The marketplace is found by its repository, whatever
// it was named; a local folder or an unknown source is left alone.
const REPO = 'OG-Matcha/tessera'
export const MARKETPLACE = 'og-matcha'

type Marketplace = { source?: { source?: string; repo?: string; url?: string }; autoUpdate?: boolean }

// The names tessera's marketplace is known under: its GitHub repository, or a git URL of it. A name is
// what the person typed in `claude plugin marketplace add`, and goes into commands shown to them, so
// only plain names count; settings are read from the user's own file, not a repository's.
const NAME = /^[A-Za-z0-9._-]+$/
const REPO_URL = new RegExp(String.raw`^(?:https?://|git@)github\.com[/:]${REPO.replace('/', '\\/')}(?:\.git)?/?$`, 'i')

function ours(settings: Record<string, unknown>): [string, Marketplace][] {
  const markets = settings.extraKnownMarketplaces
  if (markets === null || typeof markets !== 'object') return []
  return Object.entries(markets as Record<string, Marketplace>).filter(([name, m]) => {
    const source = m?.source
    return NAME.test(name) && (source?.repo?.toLowerCase() === REPO.toLowerCase() || REPO_URL.test(source?.url ?? ''))
  })
}

// The name of tessera's marketplace when none of its entries has auto-update on.
export function marketplaceWithoutUpdates(settings: Record<string, unknown>): string | undefined {
  const mine = ours(settings)
  return mine.length > 0 && mine.every(([, m]) => m.autoUpdate !== true) ? mine[0]![0] : undefined
}

// The name tessera's marketplace was added under before it was renamed: Claude Code looks a plugin up
// by the name its marketplace declares, so that install no longer updates.
export function marketplaceRenamed(settings: Record<string, unknown>): string | undefined {
  return ours(settings).find(([name]) => name !== MARKETPLACE)?.[0]
}
