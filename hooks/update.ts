// Claude Code updates a third-party marketplace only when the person turns auto-update on for it, so an
// install from GitHub stays on its first version. The marketplace is found by its repository, whatever
// it was named; a local folder or an unknown source is left alone.
const REPO = 'OG-Matcha/tessera'

type Marketplace = { source?: { source?: string; repo?: string; url?: string }; autoUpdate?: boolean }

// The name of tessera's marketplace when none of its entries has auto-update on.
export function marketplaceWithoutUpdates(settings: Record<string, unknown>): string | undefined {
  const markets = settings.extraKnownMarketplaces
  if (markets === null || typeof markets !== 'object') return undefined
  const ours = Object.entries(markets as Record<string, Marketplace>).filter(([, m]) => {
    const source = m?.source
    return source?.repo?.toLowerCase() === REPO.toLowerCase() || (source?.url?.toLowerCase().includes(REPO.toLowerCase()) ?? false)
  })
  return ours.length > 0 && ours.every(([, m]) => m.autoUpdate !== true) ? ours[0]![0] : undefined
}
