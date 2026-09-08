/**
 * Engine: owns the World, the pixel buffers and the frame loop.
 *
 * Simulation runs on a fixed 60 Hz timestep (scaled by the speed multiplier)
 * driven by an accumulator, so tick rate is independent of the display's
 * refresh rate: a 120 Hz monitor does not make sand fall twice as fast, and a
 * slow frame is caught up with several ticks (bounded, to avoid the spiral of
 * death). Rendering happens once per animation frame regardless.
 *
 * Painting is buffered: the pointer position is recorded by the UI and the
 * stamp is applied at the top of every tick while the button is held, so a
 * still brush keeps pouring like a tap.
 */
import { World, type BrushShape } from '../sim/world'
import { E, SPECIES_SLOTS } from '../sim/species'
import { createRenderBuffers, renderPixels, type RenderBuffers } from '../render/pixels'
import { Presenter } from '../render/presenter'

export const TICK_HZ = 60
/** Never simulate more than this many ticks in one frame. */
const MAX_TICKS_PER_FRAME = 12

export interface EngineStats {
  fps: number
  tps: number
  generation: number
  /** Per-species cell counts (indexed by species id). */
  counts: Uint32Array
  live: number
  mode: 'webgl2' | '2d' | 'none'
  /** Milliseconds of simulation work in the last measured second. */
  simMs: number
  renderMs: number
}

export interface Brush {
  element: number
  radius: number
  shape: BrushShape
}

export class Engine {
  world: World
  private buffers: RenderBuffers
  private presenter: Presenter | null = null
  private raf = 0
  private last = 0
  private acc = 0
  private frame = 0
  paused = false
  speed = 1
  glow = true

  // Painting
  private pointerDown = false
  private px = 0
  private py = 0
  private lastPx = -1
  private lastPy = -1
  brush: Brush = { element: E.Sand, radius: 3, shape: 'circle' }

  // Meters
  private frames = 0
  private ticks = 0
  private simMsAcc = 0
  private renderMsAcc = 0
  private meterStart = 0
  private listeners = new Set<(s: EngineStats) => void>()
  readonly stats: EngineStats = {
    fps: 0,
    tps: 0,
    generation: 0,
    counts: new Uint32Array(SPECIES_SLOTS),
    live: 0,
    mode: 'none',
    simMs: 0,
    renderMs: 0,
  }

  constructor(size: number, seed = (Math.random() * 0xffffffff) >>> 0) {
    this.world = new World(size, size, seed)
    this.buffers = createRenderBuffers(size, size)
  }

  get size(): number {
    return this.world.width
  }

  /** Bind (or rebind) the display canvas. The canvas is resized to the grid. */
  attach(canvas: HTMLCanvasElement): void {
    this.presenter?.dispose()
    this.presenter = new Presenter(canvas, this.world.width, this.world.height)
    this.stats.mode = this.presenter.mode
    this.draw()
  }

  detach(): void {
    this.presenter?.dispose()
    this.presenter = null
    this.stats.mode = 'none'
  }

  /** Swap in a fresh world of a new size (canvas must be re-attached). */
  resize(size: number): void {
    if (size === this.world.width) return
    this.world = new World(size, size, this.world.rng.next())
    this.buffers = createRenderBuffers(size, size)
    this.presenter?.dispose()
    this.presenter = null
    this.stats.mode = 'none'
  }

  start(): void {
    if (this.raf) return
    this.last = performance.now()
    this.meterStart = this.last
    this.acc = 0
    this.raf = requestAnimationFrame(this.loop)
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  onStats(fn: (s: EngineStats) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Apply UI tool state in one call (keeps React components from poking fields). */
  configure(opts: { paused: boolean; speed: number; glow: boolean; brush: Brush }): void {
    this.paused = opts.paused
    this.speed = opts.speed
    this.glow = opts.glow
    if (this.overriddenElement !== null) {
      // Mid-stroke erase override: remember the new pick, keep erasing for now.
      this.overriddenElement = opts.brush.element
      this.brush = { ...opts.brush, element: E.Empty }
    } else {
      this.brush = opts.brush
    }
    if (this.paused) this.draw()
  }

  // --------------------------------------------------------------- painting

  private overriddenElement: number | null = null

  /**
   * Begin a stroke at grid coordinates. `erase` temporarily swaps the brush
   * element for the eraser (right button / secondary touch) until the stroke ends.
   */
  pointerBegin(x: number, y: number, erase = false): void {
    if (erase) {
      this.overriddenElement = this.brush.element
      this.brush = { ...this.brush, element: E.Empty }
    }
    this.pointerDown = true
    this.px = x
    this.py = y
    this.lastPx = x
    this.lastPy = y
    this.stamp(x, y)
  }

  /** Continue a stroke. Paints the segment immediately so fast strokes are continuous. */
  pointerMove(x: number, y: number): void {
    if (!this.pointerDown) return
    const b = this.brush
    this.world.paintLine(this.lastPx, this.lastPy, x, y, b.radius, b.element, b.shape, b.element === E.Empty)
    this.lastPx = x
    this.lastPy = y
    this.px = x
    this.py = y
    if (this.paused) this.draw()
  }

  pointerEnd(): void {
    this.pointerDown = false
    if (this.overriddenElement !== null) {
      this.brush = { ...this.brush, element: this.overriddenElement }
      this.overriddenElement = null
    }
  }

  private stamp(x: number, y: number): void {
    const b = this.brush
    // Eraser is "forced" so it also removes walls; other elements only fill
    // empty cells, letting you drizzle sand into water without deleting it.
    this.world.paint(x, y, b.radius, b.element, b.shape, b.element === E.Empty)
    if (this.paused) this.draw()
  }

  // ------------------------------------------------------------------- loop

  /** Advance exactly one tick (used by the Step button / N key). */
  stepOnce(): void {
    if (this.pointerDown) this.stamp(this.px, this.py)
    this.world.tick()
    this.ticks++
    this.draw()
  }

  clear(): void {
    this.world.clear()
    this.draw()
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    let dt = now - this.last
    this.last = now
    if (dt > 250) dt = 250 // tab was hidden: don't try to catch up a minute of ticks

    if (!this.paused) {
      const step = 1000 / (TICK_HZ * this.speed)
      this.acc += dt
      let n = 0
      const t0 = performance.now()
      while (this.acc >= step && n < MAX_TICKS_PER_FRAME) {
        if (this.pointerDown) this.stamp(this.px, this.py)
        this.world.tick()
        this.acc -= step
        n++
      }
      if (n === MAX_TICKS_PER_FRAME) this.acc = 0
      this.ticks += n
      this.simMsAcc += performance.now() - t0
    }

    const t1 = performance.now()
    this.draw()
    this.renderMsAcc += performance.now() - t1
    this.frames++

    if (now - this.meterStart >= 500) {
      const secs = (now - this.meterStart) / 1000
      const s = this.stats
      s.fps = Math.round(this.frames / secs)
      s.tps = Math.round(this.ticks / secs)
      s.simMs = this.simMsAcc / secs
      s.renderMs = this.renderMsAcc / secs
      s.generation = this.world.generation
      s.live = this.world.tally()
      s.counts.set(this.world.counts)
      this.frames = 0
      this.ticks = 0
      this.simMsAcc = 0
      this.renderMsAcc = 0
      this.meterStart = now
      for (const fn of this.listeners) fn(s)
    }
  }

  /** Render the current world into the ImageData and present it. */
  draw(): void {
    const p = this.presenter
    if (!p) return
    this.frame++
    renderPixels(this.world, p.pixels, this.buffers, { glow: this.glow, frame: this.frame })
    p.present()
  }
}
