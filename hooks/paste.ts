const PLACEHOLDER = /\[Pasted text #(\d+)(?: \+(\d+) lines?)?\]/g

export type Placeholder = { n: number; extraLines: number | undefined }

export const placeholders = (text: string): Placeholder[] => {
  const seen = new Map<number, Placeholder>()
  for (const m of text.matchAll(PLACEHOLDER)) seen.set(Number(m[1]), { n: Number(m[1]), extraLines: m[2] === undefined ? undefined : Number(m[2]) })
  return [...seen.values()]
}

export const clipboardText = (clip: string) => clip.replace(/\r\n?/g, '\n').replace(/\n+$/, '')

// Claude Code keeps a collapsed paste to itself, so its text is taken from the clipboard, and only when
// the clipboard has the line count the placeholder states: "+29 lines" for 30 lines, or 31 with a final
// line break the clipboard tools drop; none for one line.
export function clipboardHolds(clip: string, extraLines: number | undefined): boolean {
  const text = clipboardText(clip)
  if (text === '') return false
  const lines = text.split('\n').length
  return extraLines === undefined ? lines === 1 : extraLines === lines - 1 || extraLines === lines
}
