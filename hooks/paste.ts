const PLACEHOLDER = /\[Pasted text #(\d+)(?: \+(\d+) lines?)?\]/g

export type Placeholder = { n: number; extraLines: number | undefined }

export const placeholders = (text: string): Placeholder[] => {
  const seen = new Map<number, Placeholder>()
  for (const m of text.matchAll(PLACEHOLDER)) seen.set(Number(m[1]), { n: Number(m[1]), extraLines: m[2] === undefined ? undefined : Number(m[2]) })
  return [...seen.values()]
}

// Claude Code names a project's folder under its temp root after the working directory, with every
// character but an ASCII letter or digit made '-': I:\work\orca is I-----orca.
export const projectFolder = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')

export type PastedFile = { project: string; path: string; mtimeMs: number; size: number }

// One session can own an images folder under several project folders (resumed elsewhere, or its working
// directory changed), each numbering from 1, so <n>.png can exist in more than one. The paste the draft
// means is the one written last; on a tie (an engine that reports no time) the working directory's
// folder wins, then the order found.
export function latestPaste(found: PastedFile[], currentProject: string | undefined): PastedFile | undefined {
  let best: PastedFile | undefined
  for (const file of found) {
    if (best === undefined || file.mtimeMs > best.mtimeMs || (file.mtimeMs === best.mtimeMs && file.project === currentProject && best.project !== currentProject)) best = file
  }
  return best
}

export const clipboardText =(clip: string) => clip.replace(/\r\n?/g, '\n').replace(/\n+$/, '')

// Claude Code keeps a collapsed paste to itself, so its text is taken from the clipboard, and only when
// the clipboard has the line count the placeholder states: "+29 lines" for 30 lines, or 31 with a final
// line break the clipboard tools drop; none for one line.
export function clipboardHolds(clip: string, extraLines: number | undefined): boolean {
  const text = clipboardText(clip)
  if (text === '') return false
  const lines = text.split('\n').length
  return extraLines === undefined ? lines === 1 : extraLines === lines - 1 || extraLines === lines
}
