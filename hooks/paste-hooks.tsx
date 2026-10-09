import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { DraftImage, DraftPaste, ImageView } from '../types'
import type { Rgba } from './png'
import { decodePng, pngSize } from './png'
import { fitCells, thumbnail } from './raster'
import { clipboardReaders, drawsPixels, openers, pasteRoot } from './platform'
import { clipboardHolds, clipboardText, placeholders } from './paste'
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
let tmpRoot: string | undefined
let imagesDir: { sessionId: string; dir: string } | undefined
let shownKey = ''
let isChecking = false
const pixels = new Map<string, Rgba | null>()
// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png; on Windows <tmp> is %TEMP%\claude.
async function root($: EngineInterface): Promise<string> {
  if (tmpRoot !== undefined) return tmpRoot
  const base = pasteRoot(session.env)
  tmpRoot = base.includes('{uid}') ? base.replace('{uid}', (await $.process.run(['id', '-u'])).stdout.trim()) : base
  return tmpRoot
}

async function findImagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (imagesDir?.sessionId === sessionId) return imagesDir.dir
  const base = await root($)
  for (const entry of await $.fs.list(base).catch(() => [])) {
    const dir = `${base}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      imagesDir = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

// Null when the file is no PNG this decoder reads or is over the engine's 4 MiB read cap.
async function pixelsOf($: EngineInterface, path: string): Promise<Rgba | null> {
  if (!pixels.has(path)) {
    const file = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
    pixels.set(path, file === undefined ? null : decodePng(Uint8Array.fromBase64(file.base64)))
  }
  return pixels.get(path) ?? null
}

async function viewOf($: EngineInterface, path: string): Promise<ImageView | null> {
  const [maxColumns, maxRows] = thumbBox
  if (usePixels) {
    const file = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
    const size = file === undefined ? null : pngSize(Uint8Array.fromBase64(file.base64))
    return { kind: 'pixels', ...fitCells(size?.width ?? 16, size?.height ?? 9, maxColumns, maxRows) }
  }
  const img = await pixelsOf($, path)
  return img === null ? null : { kind: 'cells', ...thumbnail(img, maxColumns, maxRows) }
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
    if (key === shownKey) return
    const dir = numbers.length > 0 ? await findImagesDir($) : undefined
    const list: DraftImage[] = []
    if (dir !== undefined) {
      for (const n of numbers) {
        const path = `${dir}/${n}.png`
        if (!(await $.fs.exists(path))) continue
        list.push({ n, path, view: await viewOf($, path) })
      }
    }
    shownKey = list.length === numbers.length ? key : ''
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

export function registerPastes(on: On, options: Record<string, unknown>) {
  imageMode = typeof options.imageMode === 'string' ? options.imageMode : 'auto'
  thumbBox = THUMB_SIZES[String(options.thumbnailSize)] ?? thumbBox

  // Previews draw on the terminal only. The environment is read once register.tsx's session.start has run.
  on('session.start', { surface: 'terminal' }, async ($, e, next) => {
    const started = await next(e)
    usePixels = drawsPixels(imageMode, session.env)
    $.clock.every(POLL_MS, () => void check($))
    return started
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, draftImages)
    const texts = await read($, draftPastes)
    if (list.length === 0 && texts.length === 0) return next(e)
    const { Box, Text, Raster, Image, Button } = $.ui.resolve(e)
    const width = Math.max(20, (e.viewport?.columns ?? 80) - 4)
    return (
      <Box flexDirection="column">
        {texts.map(paste => (
          <Box key={`paste-${paste.n}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Text dimColor>{t().pastedText(paste.n, paste.total)}</Text>
            {paste.head.map((line, i) => (
              <Text key={`paste-${paste.n}-${i}`} wrap="truncate-end">{[...line].slice(0, width).join('') || ' '}</Text>
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
      </Box>
    )
  })
}
