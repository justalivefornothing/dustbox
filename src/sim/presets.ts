/**
 * Bundled preset scenes. The RLE strings live in the generated
 * `presets.data.ts`; this module decodes them into a World of any size.
 */
import { PRESET_DATA, type PresetData } from './presets.data'
import { decodeGrid, resampleSpecies } from './rle'
import { initialRegister } from './rules'
import type { World } from './world'

export type { PresetData }
export const PRESETS: readonly PresetData[] = PRESET_DATA

export function presetById(id: string): PresetData | undefined {
  return PRESETS.find((p) => p.id === id)
}

/**
 * Load a preset into `world`, resampling if the sizes differ. Registers are
 * re-initialised per species (fire lifetimes, ice frost budgets, liquid
 * headings) and every cell gets a fresh shade.
 */
export function loadPreset(world: World, preset: PresetData): void {
  const snap = decodeGrid(preset.rle)
  const species = resampleSpecies(snap.species, snap.width, snap.height, world.width, world.height)
  world.clear()
  for (let i = 0; i < species.length; i++) {
    const s = species[i]
    if (s !== 0) world.setAt(i, s, initialRegister(s, world.rng))
  }
}
