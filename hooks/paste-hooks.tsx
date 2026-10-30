import { atom, read, update } from 'claude-code'
import type { EngineInterface, MatchedHook } from 'claude-code'

import type { DraftImage, DraftPaste, ImageView } from '../types'
import { decodePng, pngSize } from './png'
import { fitCells, thumbnail } from './raster'
import { clipboardReaders, drawsPixels, openers, pasteRoot } from './platform'
import type { PastedFile } from './paste'
import { clipboardHolds, clipboardText, latestPaste, placeholders, projectFolder } from './paste'
import { mask } from './mask'
import { session, t } from './session'

const draftImages = atom({ plugin: 'tessera', key: 'draftImages' } as const, [] as DraftImage[])

const draftPastes = atom({ plugin: 'tessera', key: 'draftPastes' } as const, [] as DraftPaste[])

const POLL_MS = 250
const PASTE_HEAD = 4
const pastes = new Map<number, string | null>()
let shownPastes = ''
const THUMB_SIZES: Record<string, [number, number]> = { small: [28, 8], medium: [40, 12], large: [64, 20] }

let thumbBox: [number, number] = [40, 12]
let imageMode = 'auto'
let usePixels = false
// How often images already shown are looked at again, and the soonest the temp root is listed again
// for an image not found.
const RECHECK_MS = 2_000
const VIEWS_KEPT = 64
let tmpRoot: string | undefined
let folders: { sessionId: string; at: number; projects: string[] } | undefined
let checkedKey = ''
let checkedAt = 0
let isComplete = true
let shownKey = ''
let isChecking = false
const views = new Map<string, ImageView | null>()
// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png; on Windows <tmp> is %TEMP%\claude.
async function root($: EngineInterface): Promise<string> {
  if (tmpRoot !== undefined) return tmpRoot
  const base = pasteRoot(session.env)
  const uid = base.includes('{uid}') ? (await $.process.run(['id', '-u']).catch(() => undefined))?.stdout.trim() || undefined : undefined
  tmpRoot = uid === undefined ? base : base.replace('{uid}', uid)
  return tmpRoot
}

// Every project folder with an images folder of this session: a resumed session, or one whose working
// directory changed, has one under each project it ran in.
async function listFolders($: EngineInterface, base: string, sessionId: string, now: number): Promise<string[]> {
  const projects: string[] = []
  for (const entry of await $.fs.list(base).catch(() => [])) {
    if (entry.kind === 'dir' && (await $.fs.exists(`${base}/${entry.name}/${sessionId}/images`))) projects.push(entry.name)
  }
  folders = { sessionId, at: now, projects }
  return projects
}

// <n>.png as written last in any of the folders. The working directory's own folder is looked in even
// when the last listing missed it: Claude Code may write a project's first paste after the placeholder.
async function findPaste($: EngineInterface, base: string, sessionId: string, projects: string[], current: string | undefined, n: number): Promise<PastedFile | undefined> {
  const found: PastedFile[] = []
  for (const project of current === undefined || projects.includes(current) ? projects : [...projects, current]) {
    const path = `${base}/${project}/${sessionId}/images/${n}.png`
    const stat = await $.fs.stat(path).catch(() => undefined)
    if (stat?.kind === 'file') found.push({ project, path, mtimeMs: stat.mtimeMs ?? 0, size: stat.size ?? 0 })
  }
  return latestPaste(found, current)
}

// The view of a pasted image at the current thumbnail size, decoded once per version of the file: the
// pixels themselves are not kept (a 4K paste is 33 MB), and a file this decoder cannot read (not a PNG,
// over the engine's 4 MiB read cap) stays null rather than being decoded again every quarter second.
// The time and size are in the key because a resumed session writes <n>.png over an older paste.
async function viewOf($: EngineInterface, pasted: PastedFile): Promise<ImageView | null> {
  const [maxColumns, maxRows] = thumbBox
  const { path } = pasted
  const key = `${usePixels ? 'pixels' : 'cells'}:${maxColumns}x${maxRows}:${pasted.mtimeMs}:${pasted.size}:${path}`
  const known = views.get(key)
  if (known !== undefined) return known
  const file = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
  if (file === undefined) return null
  let view: ImageView | null = null
  try {
    const bytes = Uint8Array.fromBase64(file.base64)
    if (usePixels) {
      const size = pngSize(bytes)
      view = { kind: 'pixels', ...fitCells(size?.width ?? 16, size?.height ?? 9, maxColumns, maxRows) }
    } else {
      const img = decodePng(bytes)
      view = img === null ? null : { kind: 'cells', ...thumbnail(img, maxColumns, maxRows) }
    }
  } catch {
    view = null
  }
  if (views.size >= VIEWS_KEPT) views.clear()
  views.set(key, view)
  return view
}

async function check($: EngineInterface) {
  if (isChecking) return
  isChecking = true
  try {
    const draft = (await $.prompt.read()).text
    const found = placeholders(draft)
    for (const p of found) if (!pastes.has(p.n)) pastes.set(p.n, await readPaste($, p.extraLines))
    const pasted = found.map(p => p.n).filter(n => typeof pastes.get(n) === 'string')
    if (pasted.join(',') !== shownPastes) {
      shownPastes = pasted.join(',')
      await update($, draftPastes, () =>
        pasted.map(n => {
          const lines = (pastes.get(n) ?? '').split(/\r?\n/)
          return { n, total: lines.length, head: lines.slice(0, PASTE_HEAD) }
        }),
      )
    }
    const numbers = [...new Set([...draft.matchAll(/\[Image #(\d+)\]/g)].map(m => Number(m[1])))]
    const key = numbers.join(',')
    const now = await $.clock.now()
    if (key === checkedKey && isComplete && (numbers.length === 0 || now - checkedAt < RECHECK_MS)) return
    const isNewKey = key !== checkedKey
    checkedKey = key
    checkedAt = now
    const files: (PastedFile & { n: number })[] = []
    if (numbers.length > 0) {
      const sessionId = await $.session.id()
      const base = await root($)
      const cwd = await $.session.cwd().catch(() => undefined)
      const current = cwd === undefined ? undefined : projectFolder(cwd)
      // The folders are listed again for a new draft or session, and at most every RECHECK_MS while an
      // image is not found; in between only the files themselves are looked at.
      let projects = folders?.sessionId === sessionId && !isNewKey ? folders.projects : await listFolders($, base, sessionId, now)
      const findAll = async () => {
        files.length = 0
        for (const n of numbers) {
          const file = await findPaste($, base, sessionId, projects, current, n)
          if (file !== undefined) files.push({ ...file, n })
        }
      }
      await findAll()
      if (files.length < numbers.length && folders !== undefined && now - folders.at >= RECHECK_MS) {
        projects = await listFolders($, base, sessionId, now)
        await findAll()
      }
    }
    isComplete = files.length === numbers.length
    const shown = files.map(f => `${f.path}:${f.mtimeMs}:${f.size}`).join(',')
    if (shown === shownKey) return
    shownKey = shown
    const list: DraftImage[] = []
    for (const file of files) list.push({ n: file.n, path: file.path, view: await viewOf($, file) })
    await update($, draftImages, () => list)
  } finally {
    isChecking = false
  }
}

async function openOriginal($: EngineInterface, path: string) {
  for (const argv of openers(session.env, path)) {
    const run = await $.process.run(argv, { timeoutMs: 5_000 }).catch(() => undefined)
    if (run?.exitCode === 0) return
  }
}

// The text of a just-collapsed paste, read once from the clipboard; null when the clipboard no longer
// matches it (copied over since, or the paste came from another machine over SSH).
async function readPaste($: EngineInterface, extraLines: number | undefined): Promise<string | null> {
  for (const argv of clipboardReaders(session.env)) {
    const run = await $.process.run(argv, { timeoutMs: 3_000 }).catch(() => undefined)
    if (run?.exitCode === 0) return clipboardHolds(run.stdout, extraLines) ? clipboardText(run.stdout) : null
  }
  return null
}

export function configurePastes(options: Record<string, unknown>) {
  imageMode = typeof options.imageMode === 'string' ? options.imageMode : 'auto'
  thumbBox = THUMB_SIZES[String(options.thumbnailSize)] ?? thumbBox
}

// Previews draw on the terminal only. The environment is read once register.tsx's session.start has run.
export const startPastes: MatchedHook<'session.start', { surface: 'terminal' }> = async ($, e, next) => {
  const started = await next(e)
  usePixels = drawsPixels(imageMode, session.env)
  $.clock.every(POLL_MS, () => void check($))
  return started
}

export const pasteBand: MatchedHook<'ui.render', { component: 'AbovePrompt' }> = async ($, e, next) => {
  if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
  const list = await read($, draftImages)
  const texts = await read($, draftPastes)
  if (list.length === 0 && texts.length === 0) return next(e)
  const { Box, Text, Raster, Image, Button } = $.ui.resolve(e)
  const width = Math.max(20, (e.viewport?.columns ?? 80) - 4)
  // What other plugins draw above the prompt stays, below the previews.
  const below = await next(e)
  return (
    <Box flexDirection="column">
      {texts.map(paste => (
        <Box key={`paste-${paste.n}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Text dimColor>{t().pastedText(paste.n, paste.total)}</Text>
          {paste.head.map((line, i) => (
            <Text key={`paste-${paste.n}-${i}`} wrap="truncate-end">{[...(session.recording ? mask(line) : line)].slice(0, width).join('') || ' '}</Text>
          ))}
          {paste.total > paste.head.length && <Text dimColor>…</Text>}
        </Box>
      ))}
    <Box flexDirection="row" gap={2}>
      {list.map(img => (
        <Box key={`img-${img.n}`} flexDirection="column" alignItems="center">
          {img.view === null ? (
            <Text dimColor>{t().noPreview}</Text>
          ) : img.view.kind === 'pixels' ? (
            <Image key={`image-${img.n}`} source={{ file: img.path, format: 'png' }} columns={img.view.columns} rows={img.view.rows} alt={`[Image #${img.n}]`} />
          ) : (
            <Raster key={`raster-${img.n}`} columns={img.view.columns} rows={img.view.rows} cells={img.view.cells} />
          )}
          <Box flexDirection="row" gap={1}>
            <Text dimColor>#{img.n}</Text>
            <Button key={`open-${img.n}`} label={t().original} onPress={() => openOriginal($, img.path)} />
          </Box>
        </Box>
      ))}
    </Box>
    {below}
    </Box>
  )
}
