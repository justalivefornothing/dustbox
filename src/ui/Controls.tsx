import type { Engine } from '../app/engine'
import { MAX_BRUSH, MIN_BRUSH, SPEEDS, useTools } from '../app/store'

interface Props {
  engine: Engine
}

export function Controls({ engine }: Props) {
  const brushSize = useTools((s) => s.brushSize)
  const setBrushSize = useTools((s) => s.setBrushSize)
  const shape = useTools((s) => s.shape)
  const setShape = useTools((s) => s.setShape)
  const paused = useTools((s) => s.paused)
  const togglePaused = useTools((s) => s.togglePaused)
  const speed = useTools((s) => s.speed)
  const setSpeed = useTools((s) => s.setSpeed)

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-3 px-2">
      <label className="flex min-w-[200px] flex-1 items-center gap-2 sm:max-w-xs">
        <span className="text-[11px] uppercase text-dust">
          Brush <span className="tabular-nums text-chalk">{brushSize}</span>
        </span>
        <input
          type="range"
          className="slider"
          min={MIN_BRUSH}
          max={MAX_BRUSH}
          step={1}
          value={brushSize}
          aria-label="Brush size"
          onChange={(e) => setBrushSize(Number(e.target.value))}
        />
        <span className="hidden text-[10px] text-dust sm:inline">
          <span className="kbd">[</span> <span className="kbd">]</span>
        </span>
      </label>

      <div role="group" aria-label="Brush shape" className="flex">
        <button
          type="button"
          className="btn"
          aria-pressed={shape === 'circle'}
          title="Round brush (B toggles)"
          onClick={() => setShape('circle')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" shapeRendering="crispEdges">
            <path d="M4 1h4v1h2v2h1v4h-1v2H8v1H4v-1H2V8H1V4h1V2h2z" fill="currentColor" />
          </svg>
          Round
        </button>
        <button
          type="button"
          className="btn -ml-0.5"
          aria-pressed={shape === 'square'}
          title="Square brush (B toggles)"
          onClick={() => setShape('square')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="1" y="1" width="10" height="10" fill="currentColor" />
          </svg>
          Square
        </button>
      </div>

      <div role="group" aria-label="Playback" className="flex">
        <button
          type="button"
          className="btn min-w-[88px]"
          aria-pressed={paused}
          title="Pause / resume (Space)"
          onClick={togglePaused}
        >
          {paused ? '▶ Play' : '❙❙ Pause'}
        </button>
        <button
          type="button"
          className="btn -ml-0.5"
          title="Advance one tick (N)"
          onClick={() => {
            if (!paused) togglePaused()
            engine.stepOnce()
          }}
        >
          Step
        </button>
        <button
          type="button"
          className="btn btn-danger -ml-0.5"
          title="Clear the grid (Delete)"
          onClick={() => engine.clear()}
        >
          Clear
        </button>
      </div>

      <label className="flex items-center gap-2">
        <span className="text-[11px] uppercase text-dust">Speed</span>
        <select className="field" value={speed} aria-label="Simulation speed" onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
