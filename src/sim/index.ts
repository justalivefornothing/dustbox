/**
 * Dustbox simulation core. Dependency-free; runs in Node, Workers and browsers.
 */
export { World } from './world'
export type { BrushShape, WorldSnapshot } from './world'
export { Rng } from './rng'
export { ELEMENTS, PAINTABLE, RULES, elementForKey } from './elements'
export type { ElementDef } from './elements'
export {
  E,
  SPECIES,
  SPECIES_SLOTS,
  PHASE,
  DENSITY,
  PHASE_OF,
  FLAMMABILITY,
  GLOW,
  canSinkInto,
  canRiseInto,
} from './species'
export type { Species, SpeciesData, RGB } from './species'
export { initialRegister, explode } from './rules'
export type { Rule } from './rules'
export {
  rleEncode,
  rleDecode,
  bytesToBase64,
  base64ToBytes,
  encodeGrid,
  decodeGrid,
  resampleSpecies,
  FORMAT_TAG,
} from './rle'
export type { GridSnapshot } from './rle'
export { nearestElement, buildColorLut } from './palette'
