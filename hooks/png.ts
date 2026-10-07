import { unzlibSync } from './vendor/inflate.js'

export type Rgba = { width: number; height: number; rgba: Uint8Array }

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

const at = (b: Uint8Array, i: number) => b[i] ?? 0
const u32 = (b: Uint8Array, i: number) => ((at(b, i) << 24) | (at(b, i + 1) << 16) | (at(b, i + 2) << 8) | at(b, i + 3)) >>> 0

export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || SIGNATURE.some((v, i) => bytes[i] !== v)) return null
  return { width: u32(bytes, 16), height: u32(bytes, 20) }
}

// 8- and 16-bit, non-interlaced PNGs of every color type; anything else is null.
export function decodePng(bytes: Uint8Array): Rgba | null {
  const size = pngSize(bytes)
  if (size === null) return null
  const { width, height } = size
  let depth = 0
  let type = -1
  let interlace = 0
  let palette: Uint8Array | undefined
  let alpha: Uint8Array | undefined
  const parts: Uint8Array[] = []
  for (let i = 8; i + 8 <= bytes.length; ) {
    const len = u32(bytes, i)
    const kind = String.fromCharCode(at(bytes, i + 4), at(bytes, i + 5), at(bytes, i + 6), at(bytes, i + 7))
    const data = bytes.subarray(i + 8, i + 8 + len)
    if (kind === 'IHDR') {
      depth = at(data, 8)
      type = at(data, 9)
      interlace = at(data, 12)
    } else if (kind === 'PLTE') palette = data
    else if (kind === 'tRNS') alpha = data
    else if (kind === 'IDAT') parts.push(data)
    else if (kind === 'IEND') break
    i += 12 + len
  }
  const channels = CHANNELS[type]
  if (channels === undefined || interlace !== 0 || (depth !== 8 && depth !== 16)) return null

  let total = 0
  for (const p of parts) total += p.length
  const joined = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    joined.set(p, offset)
    offset += p.length
  }
  const raw = unzlibSync(joined)

  const bpp = (channels * depth) / 8
  const stride = width * bpp
  const lines = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = at(raw, y * (stride + 1))
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? at(lines, dst + x - bpp) : 0
      const b = y > 0 ? at(lines, dst + x - stride) : 0
      const c = x >= bpp && y > 0 ? at(lines, dst + x - stride - bpp) : 0
      const v = at(raw, src + x)
      let out = v
      if (filter === 1) out = v + a
      else if (filter === 2) out = v + b
      else if (filter === 3) out = v + ((a + b) >> 1)
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      lines[dst + x] = out & 255
    }
  }

  const step = depth / 8
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp
    const sample = (k: number) => at(lines, s + k * step)
    let r: number, g: number, b: number, a: number
    if (type === 0) (r = g = b = sample(0)), (a = 255)
    else if (type === 2) (r = sample(0)), (g = sample(1)), (b = sample(2)), (a = 255)
    else if (type === 3) {
      const idx = sample(0)
      r = palette?.[idx * 3] ?? 0
      g = palette?.[idx * 3 + 1] ?? 0
      b = palette?.[idx * 3 + 2] ?? 0
      a = alpha?.[idx] ?? 255
    } else if (type === 4) (r = g = b = sample(0)), (a = sample(1))
    else (r = sample(0)), (g = sample(1)), (b = sample(2)), (a = sample(3))
    rgba.set([r, g, b, a], i * 4)
  }
  return { width, height, rgba }
}
