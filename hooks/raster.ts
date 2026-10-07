import type { Rgba } from './png'

export type Thumb = { columns: number; rows: number; cells: string }

const DEFAULT = 0x01000000
const SPACE = 0x20
// Quadrant glyphs by mask of the foreground quarters: 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right
const QUADRANT = [SPACE, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b]

// Fits the image in maxColumns x maxRows cells. A cell is about twice as tall as wide, so the
// image is laid on a columns x rows*2 grid of square pixels, then sampled at twice that in each
// direction: every cell picks the quadrant glyph and two colors that best split its 2x2 samples.
export function thumbnail(img: Rgba, maxColumns: number, maxRows: number): Thumb {
  const { columns, rows } = fitCells(img.width, img.height, maxColumns, maxRows)
  const pixel = sampler(img, columns * 2, rows * 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const quad = [pixel(x * 2, y * 2), pixel(x * 2 + 1, y * 2), pixel(x * 2, y * 2 + 1), pixel(x * 2 + 1, y * 2 + 1)]
      words.set(cell(quad), (y * columns + x) * 3)
    }
  }
  return { columns, rows, cells: new Uint8Array(words.buffer).toBase64() }
}

// The cell box a width x height picture fills inside maxColumns x maxRows, a cell being about twice as tall as wide.
export function fitCells(width: number, height: number, maxColumns: number, maxRows: number): { columns: number; rows: number } {
  const scale = Math.min(maxColumns / width, (maxRows * 2) / height, 1)
  return { columns: Math.max(1, Math.round(width * scale)), rows: Math.max(1, Math.round((height * scale) / 2)) }
}

type Rgb =[number, number, number] | null

function cell(quad: Rgb[]): [number, number, number] {
  const seen = quad.filter((p): p is [number, number, number] => p !== null)
  if (seen.length < 2) return [SPACE, DEFAULT, DEFAULT]
  const filled = quad.map(p => p ?? mean(seen))
  let best = { error: Infinity, mask: 0, fg: [0, 0, 0] as number[], bg: [0, 0, 0] as number[] }
  for (let mask = 0; mask < 8; mask++) {
    const fg = filled.filter((_, i) => (mask >> i) & 1)
    const bg = filled.filter((_, i) => !((mask >> i) & 1))
    const fgMean = fg.length > 0 ? mean(fg) : [0, 0, 0]
    const bgMean = mean(bg)
    const error = spread(fg, fgMean) + spread(bg, bgMean)
    if (error < best.error) best = { error, mask, fg: fgMean, bg: bgMean }
  }
  return best.mask === 0 ? [SPACE, DEFAULT, pack(best.bg)] : [QUADRANT[best.mask] ?? SPACE, pack(best.fg), pack(best.bg)]
}

const mean = (ps: number[][]) => [0, 1, 2].map(k => ps.reduce((s, p) => s + (p[k] ?? 0), 0) / ps.length)
const spread = (ps: number[][], m: number[]) => ps.reduce((s, p) => s + p.reduce((d, v, k) => d + (v - (m[k] ?? 0)) ** 2, 0), 0)
const pack = ([r = 0, g = 0, b = 0]: number[]) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)

// Box-averages the source block behind each target pixel; a mostly transparent block is null.
function sampler(img: Rgba, w: number, h: number): (x: number, y: number) => Rgb {
  return (x, y) => {
    const x0 = Math.floor((x * img.width) / w)
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w))
    const y0 = Math.floor((y * img.height) / h)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h))
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let sy = y0; sy < y1; sy++) {
      for (let sx = x0; sx < x1; sx++) {
        const i = (sy * img.width + sx) * 4
        const alpha = img.rgba[i + 3] ?? 0
        r += (img.rgba[i] ?? 0) * alpha
        g += (img.rgba[i + 1] ?? 0) * alpha
        b += (img.rgba[i + 2] ?? 0) * alpha
        a += alpha
        n++
      }
    }
    return a < n * 128 ? null : [r / a, g / a, b / a]
  }
}
