import { useEffect, useState } from 'react'
import type { Engine, EngineStats } from '../app/engine'
import { PAINTABLE } from '../sim/elements'
import { SPECIES_SLOTS } from '../sim/species'

interface Props {
  engine: Engine
}

interface Snapshot {
  fps: number
  tps: number
  generation: number
  live: number
  counts: number[]
  mode: string
  simMs: number
  renderMs: number
}

function snapshot(s: EngineStats): Snapshot {
  return {
    fps: s.fps,
    tps: s.tps,
    generation: s.generation,
    live: s.live,
    counts: Array.from(s.counts),
    mode: s.mode,
    simMs: s.simMs,
    renderMs: s.renderMs,
  }
}

const fmt = new Intl.NumberFormat('en-US')

export function Hud({ engine }: Props) {
  const [s, setS] = useState<Snapshot>(() => ({ ...snapshot(engine.stats), counts: new Array(SPECIES_SLOTS).fill(0) }))
  useEffect(() => engine.onStats((st) => setS(snapshot(st))), [engine])

  return (
    <aside aria-label="Simulation stats" className="pixel-panel flex w-full flex-col gap-3 p-3 text-[11px] sm:w-60">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <dt className="text-dust">FPS</dt>
        <dd className="text-right text-neon">{s.fps}</dd>
        <dt className="text-dust">Ticks/s</dt>
        <dd className="text-right text-neon">{s.tps}</dd>
        <dt className="text-dust">Tick</dt>
        <dd className="text-right">{fmt.format(s.generation)}</dd>
        <dt className="text-dust">Cells</dt>
        <dd className="text-right">{fmt.format(s.live)}</dd>
        <dt className="text-dust">Sim&#47;draw</dt>
        <dd className="text-right" title="Milliseconds of work per second of wall time">
          {s.simMs.toFixed(0)}
          <span className="text-dust">/</span>
          {s.renderMs.toFixed(0)}
          <span className="text-dust">ms</span>
        </dd>
        <dt className="text-dust">Output</dt>
        <dd className="text-right uppercase">{s.mode}</dd>
      </dl>

      <div className="h-0.5 bg-line" role="presentation" />

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-1" aria-label="Cell count per element">
        {PAINTABLE.map((el) => {
          const n = s.counts[el.id] ?? 0
          return (
            <li key={el.id} className={`flex items-center gap-2 tabular-nums ${n === 0 ? 'text-dust/60' : ''}`}>
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 shrink-0 border border-ink"
                style={{
                  background: `rgb(${el.color[0]} ${el.color[1]} ${el.color[2]})`,
                  boxShadow: el.glow > 0.3 ? `0 0 6px rgb(${el.color[0]} ${el.color[1]} ${el.color[2]})` : undefined,
                }}
              />
              <span className="flex-1 truncate">{el.name}</span>
              <span className="text-right">{fmt.format(n)}</span>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
