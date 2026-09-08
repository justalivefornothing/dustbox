/**
 * Colour helpers shared by the renderer and the PNG importer.
 *
 * `buildColorLut` bakes species x shade -> RGB so the per-frame pixel loop is
 * three array reads per cell. `nearestElement` inverts that mapping for
 * "import a PNG as a level": every pixel snaps to the element whose base
 * colour is closest in RGB space.
 */
import { E, SPECIES, SPECIES_SLOTS } from './species'

/** Layout: lut[((species << 8) | shade) * 3 + channel]. */
export function buildColorLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(SPECIES_SLOTS * 256 * 3)
  for (const s of SPECIES) {
    const [r, g, b] = s.color
    for (let shade = 0; shade < 256; shade++) {
      // Two-sided triangular noise reads more natural than uniform.
      const n = ((shade - 128) / 128) * s.variation
      const o = ((s.id << 8) | shade) * 3
      lut[o] = r + n
      lut[o + 1] = g + n * 0.9
      lut[o + 2] = b + n * 0.75
    }
  }
  return lut
}

/** Species whose base colour is nearest to (r, g, b). Transparent -> Empty. */
export function nearestElement(r: number, g: number, b: number, a = 255): number {
  if (a < 128) return E.Empty
  let best: number = E.Empty
  let bestD = Number.POSITIVE_INFINITY
  for (const s of SPECIES) {
    const dr = r - s.color[0]
    const dg = g - s.color[1]
    const db = b - s.color[2]
    // Weighted for perceived brightness.
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11
    if (d < bestD) {
      bestD = d
      best = s.id
    }
  }
  return best
}
