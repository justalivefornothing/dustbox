/**
 * Seeded xorshift32 generator.
 *
 * Every random decision the simulation makes flows through one of these so a
 * given (seed, initial grid) pair always evolves identically. The generator is
 * deliberately tiny: a single 32-bit word of state and three shift/xor steps,
 * which keeps it cheap enough to call several times per cell per tick.
 */
export class Rng {
  private s: number

  constructor(seed = 0x9e3779b9) {
    // xorshift must never be seeded with zero (it would stay at zero forever).
    this.s = seed >>> 0 || 0x9e3779b9
  }

  /** Next raw 32-bit unsigned integer. */
  next(): number {
    let x = this.s
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    this.s = x
    return x
  }

  /** Integer in [0, n). */
  below(n: number): number {
    return this.next() % n
  }

  /** Fair coin. */
  bool(): boolean {
    return (this.next() & 1) === 1
  }

  /** True with probability p / 256 (p in 0..256). */
  chance(p: number): boolean {
    return (this.next() & 0xff) < p
  }

  /** Random byte 0..255. */
  byte(): number {
    return this.next() & 0xff
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next() / 4294967296
  }

  /** Either -1 or +1. */
  sign(): number {
    return (this.next() & 1) === 1 ? 1 : -1
  }

  get state(): number {
    return this.s
  }

  set state(v: number) {
    this.s = v >>> 0 || 0x9e3779b9
  }
}
