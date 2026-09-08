/**
 * Pixel writer: turns a World into RGBA bytes.
 *
 * DOM-free on purpose — the same function feeds an ImageData in the browser,
 * PNG export, and the Node preview/bench scripts. Two passes:
 *
 *   1. base colour: species x shade lookup, with lifetime-driven ramps for
 *      fire and smoke and a cheap sine-table shimmer for liquids
 *   2. glow: emissive intensity (fire, lava, a hint for acid) is box-blurred
 *      twice with running prefix sums (O(n) regardless of radius) and added
 *      on top as warm light; Uint8ClampedArray does the saturation for free
 */
import type { World } from '../sim/world'
import { E, GLOW, SPECIES, SPECIES_SLOTS } from '../sim/species'
import { buildColorLut } from '../sim/palette'

export interface RenderBuffers {
  readonly size: number
  readonly width: number
  readonly height: number
  readonly emit: Float32Array
  readonly tmp: Float32Array
  readonly prefix: Float32Array
}

export interface RenderOptions {
  /** Enable the additive glow pass. */
  glow: boolean
  /** Frame counter driving the liquid shimmer. */
  frame: number
  /** Blur radius of the glow in cells. */
  glowRadius?: number
  /** Overall glow strength multiplier. */
  glowStrength?: number
}

export function createRenderBuffers(width: number, height: number): RenderBuffers {
  const size = width * height
  return {
    size,
    width,
    height,
    emit: new Float32Array(size),
    tmp: new Float32Array(size),
    prefix: new Float32Array(Math.max(width, height) + 1),
  }
}

/** Shared colour lookup: [((species << 8) | shade) * 3 + c]. */
export const COLOR_LUT: Uint8ClampedArray = buildColorLut()

/** Fire colour ramp by remaining lifetime (0..255): ember red -> white-yellow. */
const FIRE_RAMP = new Uint8ClampedArray(256 * 3)
for (let life = 0; life < 256; life++) {
  const t = Math.min(1, life / 36)
  const o = life * 3
  FIRE_RAMP[o] = 180 + 75 * t
  FIRE_RAMP[o + 1] = 30 + 200 * t * t
  FIRE_RAMP[o + 2] = 8 + 110 * t * t * t
}

/** Smoke fades towards the background as its lifetime runs out. */
const SMOKE_RAMP = new Uint8ClampedArray(256 * 3)
{
  const bg = SPECIES[E.Empty].color
  const sm = SPECIES[E.Smoke].color
  for (let life = 0; life < 256; life++) {
    const t = Math.min(1, life / 70)
    const o = life * 3
    SMOKE_RAMP[o] = bg[0] + (sm[0] - bg[0]) * t
    SMOKE_RAMP[o + 1] = bg[1] + (sm[1] - bg[1]) * t
    SMOKE_RAMP[o + 2] = bg[2] + (sm[2] - bg[2]) * t
  }
}

/** 256-entry sine table in [-1, 1]. */
const SINE = new Float32Array(256)
for (let i = 0; i < 256; i++) SINE[i] = Math.sin((i / 256) * Math.PI * 2)

/** Shimmer amplitude per species (liquids only). */
const SHIMMER = new Float32Array(SPECIES_SLOTS)
SHIMMER[E.Water] = 9
SHIMMER[E.Oil] = 5
SHIMMER[E.Acid] = 14
SHIMMER[E.Lava] = 26

const GLOW_R = 255
const GLOW_G = 128
const GLOW_B = 44

/**
 * Write the world into `rgba` (length = 4 * size). Returns true if any
 * emissive cells were present (useful for deciding whether to composite).
 */
export function renderPixels(world: World, rgba: Uint8ClampedArray, buffers: RenderBuffers, opts: RenderOptions): boolean {
  const { species, reg, shade, size } = world
  const lut = COLOR_LUT
  const frame = opts.frame | 0
  const emit = buffers.emit
  const wantGlow = opts.glow
  let anyGlow = false

  const bg = SPECIES[E.Empty].color
  const bgR = bg[0]
  const bgG = bg[1]
  const bgB = bg[2]

  for (let i = 0, o = 0; i < size; i++, o += 4) {
    const s = species[i]
    if (s === 0) {
      rgba[o] = bgR
      rgba[o + 1] = bgG
      rgba[o + 2] = bgB
      rgba[o + 3] = 255
      if (wantGlow) emit[i] = 0
      continue
    }
    let r: number
    let g: number
    let b: number
    if (s === E.Fire) {
      const life = reg[i]
      const fo = life * 3
      const n = (shade[i] - 128) * 0.15
      r = FIRE_RAMP[fo] + n
      g = FIRE_RAMP[fo + 1] + n
      b = FIRE_RAMP[fo + 2]
      if (wantGlow) {
        emit[i] = 0.55 + Math.min(1, life / 36) * 0.65
        anyGlow = true
      }
    } else if (s === E.Smoke) {
      const so = reg[i] * 3
      const n = (shade[i] - 128) * 0.06
      r = SMOKE_RAMP[so] + n
      g = SMOKE_RAMP[so + 1] + n
      b = SMOKE_RAMP[so + 2] + n
      if (wantGlow) emit[i] = 0
    } else {
      const lo = ((s << 8) | shade[i]) * 3
      r = lut[lo]
      g = lut[lo + 1]
      b = lut[lo + 2]
      const amp = SHIMMER[s]
      if (amp !== 0) {
        const wave = SINE[(frame * 3 + shade[i] * 5 + (i % world.width) * 2) & 255] * amp
        r += wave
        g += wave
        b += wave * 0.6
      }
      if (wantGlow) {
        const gl = GLOW[s]
        if (gl !== 0) {
          emit[i] = s === E.Lava ? gl * (0.75 + 0.25 * SINE[(frame * 2 + shade[i] * 3) & 255]) : gl
          anyGlow = true
        } else {
          emit[i] = 0
        }
      }
    }
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = 255
  }

  if (wantGlow && anyGlow) {
    const radius = opts.glowRadius ?? 3
    blur2d(buffers, radius)
    blur2d(buffers, radius)
    const strength = opts.glowStrength ?? 1.15
    for (let i = 0, o = 0; i < size; i++, o += 4) {
      const e = emit[i]
      if (e <= 0.004) continue
      const k = e * strength
      rgba[o] += GLOW_R * k
      rgba[o + 1] += GLOW_G * k
      rgba[o + 2] += GLOW_B * k
    }
  }
  return anyGlow
}

/** Separable box blur of `buffers.emit` in place using prefix sums. */
function blur2d(buffers: RenderBuffers, radius: number): void {
  const { width: w, height: h, emit, tmp, prefix } = buffers
  const norm = 1 / (radius * 2 + 1)
  // Horizontal: emit -> tmp
  for (let y = 0; y < h; y++) {
    const row = y * w
    prefix[0] = 0
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + emit[row + x]
    for (let x = 0; x < w; x++) {
      const lo = x - radius < 0 ? 0 : x - radius
      const hi = x + radius + 1 > w ? w : x + radius + 1
      tmp[row + x] = (prefix[hi] - prefix[lo]) * norm
    }
  }
  // Vertical: tmp -> emit
  for (let x = 0; x < w; x++) {
    prefix[0] = 0
    for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + tmp[y * w + x]
    for (let y = 0; y < h; y++) {
      const lo = y - radius < 0 ? 0 : y - radius
      const hi = y + radius + 1 > h ? h : y + radius + 1
      emit[y * w + x] = (prefix[hi] - prefix[lo]) * norm
    }
  }
}

/** Nearest-neighbour upscale of an RGBA buffer by an integer factor. */
export function upscaleRgba(src: Uint8ClampedArray, w: number, h: number, scale: number): Uint8ClampedArray {
  if (scale === 1) return src
  const dw = w * scale
  const out = new Uint8ClampedArray(dw * h * scale * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4
      const r = src[si]
      const g = src[si + 1]
      const b = src[si + 2]
      const a = src[si + 3]
      for (let dy = 0; dy < scale; dy++) {
        let di = ((y * scale + dy) * dw + x * scale) * 4
        for (let dx = 0; dx < scale; dx++, di += 4) {
          out[di] = r
          out[di + 1] = g
          out[di + 2] = b
          out[di + 3] = a
        }
      }
    }
  }
  return out
}
