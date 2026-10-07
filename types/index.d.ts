export type DraftImage = { n: number; columns: number; rows: number; cells: string }

declare module 'claude-code' {
  interface PluginState {
    tessera: { draftImages: DraftImage[] }
  }
}
