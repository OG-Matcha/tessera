import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DraftImage } from '../types'
import { decodePng } from './png'
import { thumbnail } from './raster'

const draftImages = atom({ plugin: 'tessera', key: 'draftImages' } as const, [] as DraftImage[])

const POLL_MS = 250
const THUMB_COLUMNS = 24
const THUMB_ROWS = 8

let tmpRoot: string | undefined
let imagesDir: { sessionId: string; dir: string } | undefined
let shownKey = ''
let isChecking = false
const decoded = new Map<string, DraftImage | null>()

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png; on Windows <tmp> is %TEMP%\claude.
async function root($: EngineInterface): Promise<string> {
  if (tmpRoot !== undefined) return tmpRoot
  const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
  const winTemp = (await $.env.get('OS')) === 'Windows_NT' ? await $.env.get('TEMP') : undefined
  tmpRoot =
    fromEnv ??
    (winTemp !== undefined ? `${winTemp.replace(/\\/g, '/')}/claude` : undefined) ??
    `/tmp/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
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

async function load($: EngineInterface, dir: string, n: number): Promise<DraftImage | null> {
  const path = `${dir}/${n}.png`
  if (decoded.has(path)) return decoded.get(path) ?? null
  const file = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
  const img = file === undefined ? null : decodePng(Uint8Array.fromBase64(file.base64))
  const shown = img === null ? null : { n, ...thumbnail(img, THUMB_COLUMNS, THUMB_ROWS) }
  if (file !== undefined) decoded.set(path, shown)
  return shown
}

async function check($: EngineInterface) {
  if (isChecking) return
  isChecking = true
  try {
    const draft = (await $.prompt.read()).text
    const numbers = [...new Set([...draft.matchAll(/\[Image #(\d+)\]/g)].map(m => Number(m[1])))]
    const key = numbers.join(',')
    if (key === shownKey) return
    const dir = numbers.length > 0 ? await findImagesDir($) : undefined
    const list: DraftImage[] = []
    if (dir !== undefined) {
      for (const n of numbers) {
        const shown = await load($, dir, n)
        if (shown !== null) list.push(shown)
      }
    }
    shownKey = list.length === numbers.length ? key : ''
    await update($, draftImages, () => list)
  } finally {
    isChecking = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(POLL_MS, () => void check($))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, draftImages)
    if (list.length === 0) return next(e)
    const { Box, Text, Raster } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={2}>
        {list.map(img => (
          <Box key={`img-${img.n}`} flexDirection="column" alignItems="center">
            <Raster key={`raster-${img.n}`} columns={img.columns} rows={img.rows} cells={img.cells} />
            <Text dimColor>#{img.n}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
