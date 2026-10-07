export type DraftImage = { n: number; path: string; thumb: { columns: number; rows: number; cells: string } | null }

declare module 'claude-code' {
  interface PluginState {
    tessera: { draftImages: DraftImage[]; zoomed: DraftImage | null }
  }
}
