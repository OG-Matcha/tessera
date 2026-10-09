// A long edit diff fills the screen; the transcript shows its first lines and how many are left, and the
// stored result the model reads is untouched.
export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

// `gap` marks a shown line with lines of the diff or the file hidden right above it.
export type DiffLine = { mark: '+' | '-' | ' '; number: number; text: string; gap?: true }

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
const numbered = (hunk: Hunk, h: number): (DiffLine & { hunk: number })[] => {
  let before = hunk.oldStart
  let after = hunk.newStart
  return hunk.lines.map(line => {
    const mark = line[0] === '+' || line[0] === '-' ? line[0] : ' '
    const number = mark === '-' ? before++ : mark === '+' ? after++ : (before++, after++)
    return { mark, number, text: line.slice(1), hunk: h }
  })
}

// Each run of changed lines keeps only its first three, so a replaced block shows both what went and
// what came, and an unchanged line shows only where it touches a change. Where lines are left out between
// two shown ones, or a new hunk starts, the later one carries a gap, so the view never reads as continuous
// where it is not.
const RUN = 3

function gist(lines: readonly (DiffLine & { hunk: number })[]): DiffLine[] {
  const shown: DiffLine[] = []
  let run = 0
  let last = -1
  lines.forEach((line, i) => {
    const before = lines[i - 1]
    const after = lines[i + 1]
    run = before?.mark === line.mark ? run + 1 : 0
    const keep = line.mark === ' ' ? (before !== undefined && before.mark !== ' ') || (after !== undefined && after.mark !== ' ') : run < RUN
    if (shown.length >= SHOWN || !keep) return
    const { hunk, ...shownLine } = line
    shown.push(last !== -1 && (i > last + 1 || hunk !== lines[last]!.hunk) ? { ...shownLine, gap: true } : shownLine)
    last = i
  })
  return shown
}

export function foldPatch(patch: readonly Hunk[]): Folded | undefined {
  const all = patch.flatMap((hunk, h) => numbered(hunk, h))
  if (all.length <= FOLD_OVER) return undefined
  const shown = gist(all)
  return {
    shown,
    added: all.filter(l => l.mark === '+').length,
    removed: all.filter(l => l.mark === '-').length,
    hidden: all.length - shown.length,
  }
}
