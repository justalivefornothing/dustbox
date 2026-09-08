/**
 * PNG import/export.
 *
 * The pure half (`speciesFromRgba`) maps an RGBA image of any size onto a
 * species grid by nearest-neighbour sampling and snapping every pixel to the
 * element whose base colour is closest; it has no DOM dependency and is unit
 * tested. The browser half wraps it with canvas plumbing and `toBlob`.
 */
import { nearestElement } from '../sim/palette'
import { initialRegister } from '../sim/rules'
import type { World } from '../sim/world'
import { createRenderBuffers, renderPixels } from '../render/pixels'

/** Map an RGBA bitmap (sw x sh) onto a dw x dh species grid. */
export function speciesFromRgba(rgba: Uint8ClampedArray | Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  if (rgba.length < sw * sh * 4) throw new RangeError('rgba buffer too small for its dimensions')
  const out = new Uint8Array(dw * dh)
  // Memoise colour -> species: real images have far fewer unique colours than pixels.
  const cache = new Map<number, number>()
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh))
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw))
      const o = (sy * sw + sx) * 4
      const r = rgba[o]
      const g = rgba[o + 1]
      const b = rgba[o + 2]
      const a = rgba[o + 3]
      const key = a < 128 ? -1 : (r << 16) | (g << 8) | b
      let s = cache.get(key)
      if (s === undefined) {
        s = nearestElement(r, g, b, a)
        cache.set(key, s)
      }
      out[y * dw + x] = s
    }
  }
  return out
}

/** Replace the world contents with a species grid produced by `speciesFromRgba`. */
export function loadSpecies(world: World, species: Uint8Array): void {
  if (species.length !== world.size) throw new RangeError('species grid size mismatch')
  world.clear()
  for (let i = 0; i < species.length; i++) {
    const s = species[i]
    if (s !== 0) world.setAt(i, s, initialRegister(s, world.rng))
  }
}

// ------------------------------------------------------------------ browser

/** Decode an image file to RGBA using an offscreen 2D canvas. */
export async function decodeImageFile(file: Blob): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2D canvas unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { rgba: img.data, width: img.width, height: img.height }
  } finally {
    bitmap.close()
  }
}

/** Import an image file as a level: colours snap to the nearest element. */
export async function importPng(world: World, file: Blob): Promise<void> {
  const { rgba, width, height } = await decodeImageFile(file)
  loadSpecies(world, speciesFromRgba(rgba, width, height, world.width, world.height))
}

export type ExportScale = 1 | 2 | 4

/**
 * Render the world to a PNG blob at an integer scale via `canvas.toBlob`.
 * Renders fresh (glow included) rather than reading back the display canvas so
 * the export is identical whichever presentation path is active.
 */
export function exportPng(world: World, scale: ExportScale, glow = true): Promise<Blob> {
  const { width, height } = world
  const image = new ImageData(width, height)
  renderPixels(world, image.data, createRenderBuffers(width, height), { glow, frame: 0 })
  const base = document.createElement('canvas')
  base.width = width
  base.height = height
  base.getContext('2d')!.putImageData(image, 0, 0)
  let target = base
  if (scale !== 1) {
    target = document.createElement('canvas')
    target.width = width * scale
    target.height = height * scale
    const ctx = target.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(base, 0, 0, target.width, target.height)
  }
  return new Promise((resolve, reject) => {
    target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png')
  })
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
