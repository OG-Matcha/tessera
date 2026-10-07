export type ImageView =
  | { kind: 'pixels'; columns: number; rows: number }
  | { kind: 'cells'; columns: number; rows: number; cells: string }

export type DraftPaste = { n: number; total: number; head: string[] }

export type DraftImage = { n: number; path: string; view: ImageView | null }

declare module 'claude-code' {
  interface PluginState {
    tessera: { draftImages: DraftImage[]; draftPastes: DraftPaste[] }
  }
}
