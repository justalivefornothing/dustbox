/**
 * Shareable levels: the species grid travels in the URL fragment as a Dustbox
 * RLE string (`#DB1;w;h;<base64>`). Nothing is sent to a server; the
 * fragment never leaves the browser. Pure helpers here are unit tested.
 */
import { decodeGrid, encodeGrid, type GridSnapshot } from '../sim/rle'
import type { World } from '../sim/world'

export const HASH_PREFIX = '#level='

export function levelToHash(world: World): string {
  return HASH_PREFIX + encodeURIComponent(encodeGrid(world.snapshot(), 'species'))
}

/** Parse a location hash; returns null if it does not carry a level. */
export function levelFromHash(hash: string): GridSnapshot | null {
  if (!hash.startsWith(HASH_PREFIX)) return null
  try {
    return decodeGrid(decodeURIComponent(hash.slice(HASH_PREFIX.length)))
  } catch {
    return null
  }
}
