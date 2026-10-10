export type ImageView =
  | { kind: 'pixels'; columns: number; rows: number }
  | { kind: 'cells'; columns: number; rows: number; cells: string }

export type DraftPaste = { n: number; total: number; head: string[] }

export type DraftImage = { n: number; path: string; view: ImageView | null }

export type CarryOver = { from: string; items: string[] }

// Why tessera asks for a look at /plugin: its marketplace has auto-update off, or was added under its old name.
export type UpdateOffer = { reason: 'auto-update' | 'moved'; market: string }

// A backgrounded command whose output file has not grown for this many minutes.
export type Quiet = { id: string; command: string; minutes: number }

declare module 'claude-code' {
  interface PluginState {
    tessera: { draftImages: DraftImage[]; draftPastes: DraftPaste[]; carryOver: CarryOver | null; unfoldedDiffs: string[]; updateOffer: UpdateOffer | null; quietTasks: Quiet[] }
  }
}
