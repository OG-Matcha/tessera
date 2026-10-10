// Claude Code updates a third-party marketplace only when the person turns auto-update on for it, so an
// install from GitHub stays on its first version. The marketplace is found by its repository, whatever
// it was named; a local folder or an unknown source is left alone.
const REPO = 'OG-Matcha/tessera'
export const MARKETPLACE = 'og-matcha'

type Marketplace = { source?: { source?: string; repo?: string; url?: string }; autoUpdate?: boolean }

function ours(settings: Record<string, unknown>): [string, Marketplace][] {
  const markets = settings.extraKnownMarketplaces
  if (markets === null || typeof markets !== 'object') return []
  return Object.entries(markets as Record<string, Marketplace>).filter(([, m]) => {
    const source = m?.source
    return source?.repo?.toLowerCase() === REPO.toLowerCase() || (source?.url?.toLowerCase().includes(REPO.toLowerCase()) ?? false)
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
