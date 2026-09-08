/**
 * Species identifiers and the raw per-species data table.
 *
 * This file is deliberately rule-free so that `rules.ts` can import it
 * without creating an import cycle. `elements.ts` joins this data with the
 * rule functions into the public ELEMENTS table.
 *
 * Species ids are plain numbers (not an enum) because the project compiles
 * with `erasableSyntaxOnly`; they are stored directly in the Uint8Array grid.
 */

export const E = {
  Empty: 0,
  Wall: 1,
  Sand: 2,
  Water: 3,
  Oil: 4,
  Fire: 5,
  Smoke: 6,
  Plant: 7,
  Acid: 8,
  Lava: 9,
  Stone: 10,
  Ice: 11,
  Gas: 12,
} as const

export type Species = (typeof E)[keyof typeof E]

/** Number of species slots reserved in lookup tables (ids 0..15). */
export const SPECIES_SLOTS = 16

/**
 * Phase drives movement: solids never move, powders fall and slide,
 * liquids fall and spread, gases rise, and "energy" (fire) is its own thing.
 */
export const PHASE = {
  Solid: 0,
  Powder: 1,
  Liquid: 2,
  Gas: 3,
  Energy: 4,
} as const
export type Phase = (typeof PHASE)[keyof typeof PHASE]

export type RGB = readonly [number, number, number]

export interface SpeciesData {
  readonly id: Species
  readonly name: string
  /** Keyboard shortcut (a single key). */
  readonly key: string
  readonly color: RGB
  /** Amplitude of the per-cell shade noise applied to `color`. */
  readonly variation: number
  /** Relative density; used for sink/float swaps. Solids never swap. */
  readonly density: number
  readonly phase: Phase
  /** Per-tick, per-neighbour ignition chance out of 256 (0 = inert). */
  readonly flammability: number
  /** Emissive light intensity for the glow pass (0 = none). */
  readonly glow: number
  /** Can acid eat this? */
  readonly dissolvable: boolean
  readonly blurb: string
}

export const SPECIES: readonly SpeciesData[] = [
  {
    id: E.Empty,
    name: 'Empty',
    key: '',
    color: [16, 17, 22],
    variation: 0,
    density: 10,
    phase: PHASE.Gas,
    flammability: 0,
    glow: 0,
    dissolvable: false,
    blurb: 'Nothing. Air.',
  },
  {
    id: E.Wall,
    name: 'Wall',
    key: 'w',
    color: [72, 74, 88],
    variation: 7,
    density: 10000,
    phase: PHASE.Solid,
    flammability: 0,
    glow: 0,
    dissolvable: false,
    blurb: 'Indestructible. Even acid gives up.',
  },
  {
    id: E.Sand,
    name: 'Sand',
    key: '1',
    color: [222, 186, 108],
    variation: 22,
    density: 150,
    phase: PHASE.Powder,
    flammability: 0,
    glow: 0,
    dissolvable: true,
    blurb: 'Falls, piles up, slides down slopes. Sinks in liquids.',
  },
  {
    id: E.Water,
    name: 'Water',
    key: '2',
    color: [48, 118, 222],
    variation: 14,
    density: 100,
    phase: PHASE.Liquid,
    flammability: 0,
    glow: 0,
    dissolvable: false,
    blurb: 'Flows and levels out. Puts out fire, cools lava to stone.',
  },
  {
    id: E.Oil,
    name: 'Oil',
    key: '3',
    color: [112, 70, 52],
    variation: 12,
    density: 60,
    phase: PHASE.Liquid,
    flammability: 80,
    glow: 0,
    dissolvable: false,
    blurb: 'Floats on water. Burns fast and hot.',
  },
  {
    id: E.Fire,
    name: 'Fire',
    key: '4',
    color: [255, 176, 48],
    variation: 24,
    density: 4,
    phase: PHASE.Energy,
    flammability: 0,
    glow: 1,
    dissolvable: false,
    blurb: 'Short-lived. Ignites oil, plant and gas, leaves smoke.',
  },
  {
    id: E.Smoke,
    name: 'Smoke',
    key: 'm',
    color: [156, 158, 172],
    variation: 10,
    density: 2,
    phase: PHASE.Gas,
    flammability: 0,
    glow: 0,
    dissolvable: false,
    blurb: 'Rises and thins out to nothing.',
  },
  {
    id: E.Plant,
    name: 'Plant',
    key: '5',
    color: [64, 172, 76],
    variation: 24,
    density: 900,
    phase: PHASE.Solid,
    flammability: 40,
    glow: 0,
    dissolvable: true,
    blurb: 'Drinks adjacent water and grows into it. Burns.',
  },
  {
    id: E.Acid,
    name: 'Acid',
    key: '6',
    color: [150, 250, 60],
    variation: 22,
    density: 110,
    phase: PHASE.Liquid,
    flammability: 0,
    glow: 0.18,
    dissolvable: false,
    blurb: 'Dissolves sand, stone, plant and ice, using itself up.',
  },
  {
    id: E.Lava,
    name: 'Lava',
    key: '7',
    color: [250, 96, 26],
    variation: 26,
    density: 200,
    phase: PHASE.Liquid,
    flammability: 0,
    glow: 0.7,
    dissolvable: false,
    blurb: 'Creeps slowly, ignites everything, hardens to stone in water.',
  },
  {
    id: E.Stone,
    name: 'Stone',
    key: '8',
    color: [122, 114, 104],
    variation: 12,
    density: 1000,
    phase: PHASE.Solid,
    flammability: 0,
    glow: 0,
    dissolvable: true,
    blurb: 'Inert rock. Acid eats it slowly.',
  },
  {
    id: E.Ice,
    name: 'Ice',
    key: '9',
    color: [168, 220, 255],
    variation: 16,
    density: 950,
    phase: PHASE.Solid,
    flammability: 0,
    glow: 0,
    dissolvable: true,
    blurb: 'Freezes nearby water a few cells deep. Melts near heat.',
  },
  {
    id: E.Gas,
    name: 'Gas',
    key: '0',
    color: [176, 120, 206],
    variation: 22,
    density: 5,
    phase: PHASE.Gas,
    flammability: 255,
    glow: 0,
    dissolvable: false,
    blurb: 'Drifts upward and pools under ceilings. Explodes on contact with flame.',
  },
]

/** Fast lookup tables indexed by species id. */
export const DENSITY = new Int16Array(SPECIES_SLOTS)
export const PHASE_OF = new Uint8Array(SPECIES_SLOTS)
export const FLAMMABILITY = new Uint8Array(SPECIES_SLOTS)
export const DISSOLVABLE = new Uint8Array(SPECIES_SLOTS)
export const GLOW = new Float32Array(SPECIES_SLOTS)

for (const s of SPECIES) {
  DENSITY[s.id] = s.density
  PHASE_OF[s.id] = s.phase
  FLAMMABILITY[s.id] = s.flammability
  DISSOLVABLE[s.id] = s.dissolvable ? 1 : 0
  GLOW[s.id] = s.glow
}

/** True if `target` is a fluid (gas/liquid/powder) less dense than `self`. */
export function canSinkInto(self: number, target: number): boolean {
  return PHASE_OF[target] !== PHASE.Solid && DENSITY[target] < DENSITY[self]
}

/** True if `target` is a gas or liquid denser than `self` (buoyancy). */
export function canRiseInto(self: number, target: number): boolean {
  const p = PHASE_OF[target]
  return (p === PHASE.Gas || p === PHASE.Liquid) && DENSITY[target] > DENSITY[self]
}
