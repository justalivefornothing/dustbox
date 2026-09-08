/**
 * The public ELEMENTS registry: one typed entry per species joining the
 * static data from `species.ts` with the update rule from `rules.ts`.
 *
 * `RULES` is the hot dispatch table used by `World.tick()`; it is indexed by
 * species id and padded with no-ops so an out-of-range byte can never throw.
 */
import {
  E,
  SPECIES,
  SPECIES_SLOTS,
  type Species,
  type SpeciesData,
} from './species'
import {
  type Rule,
  noop,
  sandRule,
  waterRule,
  oilRule,
  fireRule,
  smokeRule,
  plantRule,
  acidRule,
  lavaRule,
  iceRule,
  gasRule,
} from './rules'

export interface ElementDef extends SpeciesData {
  readonly rule: Rule
}

const RULE_FOR: Record<Species, Rule> = {
  [E.Empty]: noop,
  [E.Wall]: noop,
  [E.Sand]: sandRule,
  [E.Water]: waterRule,
  [E.Oil]: oilRule,
  [E.Fire]: fireRule,
  [E.Smoke]: smokeRule,
  [E.Plant]: plantRule,
  [E.Acid]: acidRule,
  [E.Lava]: lavaRule,
  [E.Stone]: noop,
  [E.Ice]: iceRule,
  [E.Gas]: gasRule,
}

/** All species including Empty, indexed by id. */
export const ELEMENTS: readonly ElementDef[] = SPECIES.map((s) => ({ ...s, rule: RULE_FOR[s.id] }))

/** The 12 paintable elements (everything except Empty). */
export const PAINTABLE: readonly ElementDef[] = ELEMENTS.filter((e) => e.id !== E.Empty)

/** Dispatch table for the tick loop. */
export const RULES: readonly Rule[] = Array.from({ length: SPECIES_SLOTS }, (_, id) => ELEMENTS[id]?.rule ?? noop)

/** Look up an element by its keyboard shortcut (case-insensitive). */
export function elementForKey(key: string): ElementDef | undefined {
  const k = key.toLowerCase()
  return PAINTABLE.find((e) => e.key === k)
}

export { E, SPECIES_SLOTS }
export type { Species, Rule }
