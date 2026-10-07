import type { Rgba } from './png'

export type Thumb = { columns: number; rows: number; cells: string }

const UPPER_HALF = 0x2580
const DEFAULT = 0x01000000

// Fits the image in maxColumns x maxRows cells; each cell shows two stacked pixels with ▀.
export function thumbnail(img: Rgba, maxColumns: number, maxRows: number): Thumb {
  const scale = Math.min(maxColumns / img.width, (maxRows * 2) / img.height, 1)
  const columns = Math.max(1, Math.round(img.width * scale))
  const rows = Math.max(1, Math.round((img.height * scale) / 2))
  const pixel = sampler(img, columns, rows * 2)
  const words = new Uint32Array(columns * rows * 3)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 3
      words[i] = UPPER_HALF
      words[i + 1] = pixel(x, y * 2)
      words[i + 2] = pixel(x, y * 2 + 1)
    }
  }
  return { columns, rows, cells: new Uint8Array(words.buffer).toBase64() }
}

// Box-averages the source block behind each target pixel; mostly transparent blocks are the terminal's default.
function sampler(img: Rgba, w: number, h: number): (x: number, y: number) => number {
  return (x, y) => {
    const x0 = Math.floor((x * img.width) / w)
    const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w))
    const y0 = Math.floor((y * img.height) / h)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h))
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let sy = y0; sy < y1; sy++) {
      for (let sx = x0; sx < x1; sx++) {
        const i = (sy * img.width + sx) * 4
        const alpha = img.rgba[i + 3]
        r += img.rgba[i] * alpha
        g += img.rgba[i + 1] * alpha
        b += img.rgba[i + 2] * alpha
        a += alpha
        n++
      }
    }
    if (a < n * 128) return DEFAULT
    return (Math.round(r / a) << 16) | (Math.round(g / a) << 8) | Math.round(b / a)
  }
}
