export type ImageView =
  | { kind: 'pixels'; columns: number; rows: number }
  | { kind: 'cells'; columns: number; rows: number; cells: string }

export type DraftPaste = { n: number; total: number; head: string[] }

export type DraftImage = { n: number; path: string; view: ImageView | null }

export type CarryOver = { from: string; items: string[] }

// Why tessera asks for a look at /plugin: its marketplace has auto-update off, or was added under its old name.
export type UpdateOffer = { reason: 'auto-update' | 'moved'; market: string }

// The prompt cache warmed by the last response: when, for how long, what the next message re-caches, and the clock's reading.
export type CacheWarm = { since: number; ttlMs: number; tokens: number; now: number }

// A backgrounded command whose output file has not grown for this many minutes.
export type Quiet = { id: string; command: string; minutes: number }

// A prompt the person sent in this session, as the Prompt Log keeps it (hooks/prompt-log.ts).
export type LoggedPrompt = {
  n: number
  at: number
  kind: 'text' | 'command' | 'paste' | 'image' | 'remote'
  // Whitespace collapsed, pastes unwrapped and cut short: what the list and its preview show.
  text: string
  // The prompt as sent: what its transcript row carries, and what f puts back in the prompt.
  source: string
  // The transcript row's id, which $.ui.scroll takes; absent until the row is drawn.
  rowId?: string
  // The first line of the reply this prompt got.
  reply?: string
}

// The prompt selected in the log pane.
export type PromptLogView = { selected: number | null }

declare module 'claude-code' {
  interface PluginState {
    tessera: { draftImages: DraftImage[]; draftPastes: DraftPaste[]; carryOver: CarryOver | null; unfoldedDiffs: string[]; updateOffer: UpdateOffer | null; quietTasks: Quiet[]; cacheWarm: CacheWarm | null; promptLog: LoggedPrompt[]; promptLogView: PromptLogView; promptFlash: string | null }
  }
}
