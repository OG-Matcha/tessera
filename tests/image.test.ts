import { expect, test } from 'claude-code/testing'

import { decodePng } from '../hooks/png'
import { thumbnail } from '../hooks/raster'

// 4x2 RGBA: row 0 red, green, blue, transparent (Sub filter); row 1 four greys (Up filter)
const FIXTURE = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAJklEQVR4nGP8z8Dwn/E/AwMDhGBk4haRY9AwtmFwC4hmSMmr+A8Ah4IIErQVpFYAAAAASUVORK5CYII='

test('decodes an RGBA PNG through its Sub and Up filters', () => {
  const img = decodePng(Uint8Array.fromBase64(FIXTURE))
  expect(img?.width).toBe(4)
  expect(img?.height).toBe(2)
  expect([...img!.rgba.subarray(0, 16)]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0])
  expect([...img!.rgba.subarray(28, 32)]).toEqual([100, 110, 120, 255])
})

test('a non-PNG is null', () => {
  expect(decodePng(new Uint8Array([1, 2, 3]))).toBe(null)
})

test('each cell picks the quadrant glyph and two colors that split its samples best', () => {
  const thumb = thumbnail(decodePng(Uint8Array.fromBase64(FIXTURE))!, 24, 8)
  expect(thumb.columns).toBe(4)
  expect(thumb.rows).toBe(1)
  const words = new Uint32Array(Uint8Array.fromBase64(thumb.cells).buffer)
  expect([...words.subarray(0, 3)]).toEqual([0x2580, 0xff0000, 0x0a141e])
  expect([...words.subarray(9, 12)]).toEqual([0x20, 0x01000000, 0x646e78])
})

test('a vertical edge inside one cell becomes a left-half block', () => {
  const rgba = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255])
  const thumb = thumbnail({ width: 2, height: 2, rgba }, 1, 1)
  const words = new Uint32Array(Uint8Array.fromBase64(thumb.cells).buffer)
  expect([...words]).toEqual([0x258c, 0xffffff, 0x000000])
})

test('a big image fits the cell box and keeps its aspect', () => {
  const rgba = new Uint8Array(400 * 200 * 4).fill(255)
  const thumb = thumbnail({ width: 400, height: 200, rgba }, 24, 8)
  expect(thumb.columns).toBe(24)
  expect(thumb.rows).toBe(6)
})
