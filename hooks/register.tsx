import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DraftImage } from '../types'
import { decodePng } from './png'
import type { Rgba } from './png'
import { thumbnail } from './raster'
import type { Thumb } from './raster'

const draftImages = atom({ plugin: 'tessera', key: 'draftImages' } as const, [] as DraftImage[])
const zoomed = atom({ plugin: 'tessera', key: 'zoomed' } as const, null as DraftImage | null)

const PANE = 'tessera-image'
const POLL_MS = 250
const THUMB_COLUMNS = 40
const THUMB_ROWS = 12

let tmpRoot: string | undefined
let imagesDir: { sessionId: string; dir: string } | undefined
let shownKey = ''
let isChecking = false
const pixels = new Map<string, Rgba | null>()
const zooms = new Map<string, Thumb>()

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.png; on Windows <tmp> is %TEMP%\claude.
async function root($: EngineInterface): Promise<string> {
  if (tmpRoot !== undefined) return tmpRoot
  const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
  const winTemp = (await isWindows($)) ? await $.env.get('TEMP') : undefined
  tmpRoot =
    fromEnv ??
    (winTemp !== undefined ? `${winTemp.replace(/\\/g, '/')}/claude` : undefined) ??
    `/tmp/claude-${(await $.process.run(['id', '-u'])).stdout.trim()}`
  return tmpRoot
}

const isWindows = async ($: EngineInterface) => (await $.env.get('OS')) === 'Windows_NT'

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
        const path = `${dir}/${n}.png`
        if (!(await $.fs.exists(path))) continue
        const img = await pixelsOf($, path)
        list.push({ n, path, thumb: img === null ? null : thumbnail(img, THUMB_COLUMNS, THUMB_ROWS) })
      }
    }
    shownKey = list.length === numbers.length ? key : ''
    await update($, draftImages, () => list)
  } finally {
    isChecking = false
  }
}

async function openOriginal($: EngineInterface, path: string) {
  const argv = (await isWindows($))
    ? ['explorer.exe', path.replace(/\//g, '\\')]
    : [(await $.env.get('XDG_CURRENT_DESKTOP')) === undefined ? 'open' : 'xdg-open', path]
  await $.process.run(argv, { timeoutMs: 5_000 }).catch(() => undefined)
}

async function zoom($: EngineInterface, img: DraftImage) {
  await update($, zoomed, () => img)
  await $.ui.open({ id: PANE, title: `圖 #${img.n}` })
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
    const { Box, Text, Raster, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={2}>
        {list.map(img => (
          <Box key={`img-${img.n}`} flexDirection="column" alignItems="center">
            {img.thumb === null ? (
              <Text dimColor>（無法預覽）</Text>
            ) : (
              <Raster key={`raster-${img.n}`} columns={img.thumb.columns} rows={img.thumb.rows} cells={img.thumb.cells} />
            )}
            <Box flexDirection="row" gap={1}>
              <Text dimColor>#{img.n}</Text>
              {img.thumb !== null && <Button key={`zoom-${img.n}`} label="放大" onPress={() => zoom($, img)} />}
              <Button key={`open-${img.n}`} label="原圖" onPress={() => openOriginal($, img.path)} />
            </Box>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text, Raster, Button } = $.ui.resolve(e)
    const img = await read($, zoomed)
    const rgba = img === null ? null : await pixelsOf($, img.path)
    if (img === null || rgba === null) return <Text dimColor>沒有可放大的圖。</Text>
    const columns = Math.min(512, e.props.bodyColumns)
    const rows = Math.min(256, Math.max(4, e.props.scroll.bodyRows - 2))
    const key = `${img.path}:${columns}x${rows}`
    const big = zooms.get(key) ?? thumbnail(rgba, columns, rows)
    zooms.set(key, big)
    return (
      <Box flexDirection="column">
        <Raster key="zoom" columns={big.columns} rows={big.rows} cells={big.cells} />
        <Box flexDirection="row" gap={1}>
          <Text dimColor>
            #{img.n} · {rgba.width}×{rgba.height}
          </Text>
          <Button key="open" label="原圖" onPress={() => openOriginal($, img.path)} />
        </Box>
      </Box>
    )
  })
}
