// A long edit diff fills the screen; the transcript shows its first lines and how many are left, and the
// stored result the model reads is untouched.
export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

export type DiffLine = { mark: '+' | '-' | ' '; number: number; text: string }

export type Folded = { shown: DiffLine[]; added: number; removed: number; hidden: number }

const FOLD_OVER = 12
const SHOWN = 8

const isHunk = (h: unknown): h is Hunk =>
  h !== null && typeof h === 'object' && Array.isArray((h as Hunk).lines) && typeof (h as Hunk).oldStart === 'number' && typeof (h as Hunk).newStart === 'number'

export const patchOf = (output: unknown): Hunk[] => {
  const patch = output !== null && typeof output === 'object' ? (output as { structuredPatch?: unknown }).structuredPatch : undefined
  return Array.isArray(patch) ? patch.filter(isHunk) : []
}

// Removed lines carry their old line number, added and unchanged ones their new one, as Claude Code
// numbers them.
const numbered = (hunk: Hunk): DiffLine[] => {
  let before = hunk.oldStart
  let after = hunk.newStart
  return hunk.lines.map(line => {
    const mark = line[0] === '+' || line[0] === '-' ? line[0] : ' '
    const number = mark === '-' ? before++ : mark === '+' ? after++ : (before++, after++)
    return { mark, number, text: line.slice(1) }
  })
}

// Each run of lines keeps only its first few, so a replaced block shows both what went and what came:
// one line of context, three removed, three added.
const RUN = { ' ': 1, '-': 3, '+': 3 }

function gist(lines: readonly DiffLine[]): DiffLine[] {
  const shown: DiffLine[] = []
  let run = 0
  lines.forEach((line, i) => {
    run = i > 0 && lines[i - 1]?.mark === line.mark ? run + 1 : 0
    if (shown.length < SHOWN && run < RUN[line.mark]) shown.push(line)
  })
  return shown
}

export function foldPatch(patch: readonly Hunk[]): Folded | undefined {
  const all = patch.flatMap(numbered)
  if (all.length <= FOLD_OVER) return undefined
  const shown = gist(all)
  return {
    shown,
    added: all.filter(l => l.mark === '+').length,
    removed: all.filter(l => l.mark === '-').length,
    hidden: all.length - shown.length,
  }
}
