import { useRef, useState } from 'react'
import type { Engine } from '../app/engine'
import { downloadBlob, exportPng, importPng, type ExportScale } from '../app/pngio'
import { GRID_SIZES, flash, useTools, type GridSize } from '../app/store'
import { PRESETS, loadPreset } from '../sim/presets'
import { levelToHash } from '../app/share'
import { SlotsDialog } from './SlotsDialog'

interface Props {
  engine: Engine
}

export function TopBar({ engine }: Props) {
  const gridSize = useTools((s) => s.gridSize)
  const setGridSize = useTools((s) => s.setGridSize)
  const scanlines = useTools((s) => s.scanlines)
  const toggleScanlines = useTools((s) => s.toggleScanlines)
  const glow = useTools((s) => s.glow)
  const toggleGlow = useTools((s) => s.toggleGlow)
  const status = useTools((s) => s.status)
  const [slotsOpen, setSlotsOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    loadPreset(engine.world, p)
    engine.draw()
    flash(`${p.name}: ${p.blurb}`, 5000)
  }

  const onShare = async () => {
    const hash = levelToHash(engine.world)
    const url = `${location.origin}${location.pathname}${hash}`
    history.replaceState(null, '', hash)
    try {
      await navigator.clipboard.writeText(url)
      flash(`Link copied (${(url.length / 1024).toFixed(1)} KB): anyone opening it gets this level`)
    } catch {
      flash('Level is in the address bar: copy the URL to share it')
    }
  }

  const onExport = async (scale: ExportScale) => {
    setBusy(true)
    try {
      const blob = await exportPng(engine.world, scale, glow)
      downloadBlob(blob, `dustbox-${engine.size}x${engine.size}-${scale}x.png`)
      flash(`Exported PNG at ${scale}x (${(blob.size / 1024).toFixed(0)} KB)`)
    } catch (err) {
      flash(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      await importPng(engine.world, file)
      engine.draw()
      flash(`Imported ${file.name}: colours snapped to the nearest element`)
    } catch (err) {
      flash(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <header className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-5">
      <div className="mr-auto flex items-baseline gap-3">
        <h1 className="font-title text-[16px] leading-none text-neon [text-shadow:0_0_12px_rgba(125,249,255,0.55)] sm:text-[18px]">
          DUSTBOX
        </h1>
        <p className="hidden text-[11px] text-dust md:block">falling-sand cellular automaton</p>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`order-last w-full truncate text-[11px] text-ember transition-opacity lg:order-none lg:w-auto lg:max-w-[34ch] ${status ? 'opacity-100' : 'opacity-0'}`}
      >
        {status ?? ' '}
      </p>

      <label className="flex items-center gap-2">
        <span className="sr-only">Preset scene</span>
        <select className="field" defaultValue="" aria-label="Load a preset scene" onChange={(e) => onPreset(e.target.value)}>
          <option value="" disabled>
            Presets…
          </option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="btn" onClick={() => setSlotsOpen(true)} title="Save or load one of six named slots">
        Slots
      </button>

      <button type="button" className="btn" onClick={() => void onShare()} title="Copy a link that contains this level (RLE in the URL hash)">
        Share
      </button>

      <label className="flex items-center gap-2">
        <span className="sr-only">Export PNG</span>
        <select
          className="field"
          value=""
          disabled={busy}
          aria-label="Export the canvas as a PNG"
          onChange={(e) => {
            const v = Number(e.target.value) as ExportScale
            if (v === 1 || v === 2 || v === 4) void onExport(v)
          }}
        >
          <option value="" disabled>
            PNG…
          </option>
          <option value={1}>Export 1x</option>
          <option value={2}>Export 2x</option>
          <option value={4}>Export 4x</option>
        </select>
      </label>

      <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()} title="Import an image as a level (or drop one onto the canvas)">
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onImportFile(e.target.files?.[0])}
      />

      <label className="flex items-center gap-2">
        <span className="text-[11px] uppercase text-dust">Grid</span>
        <select className="field" value={gridSize} aria-label="Grid size" onChange={(e) => setGridSize(Number(e.target.value) as GridSize)}>
          {GRID_SIZES.map((g) => (
            <option key={g} value={g}>
              {g}²
            </option>
          ))}
        </select>
      </label>

      <div role="group" aria-label="Display" className="flex">
        <button type="button" className="btn" aria-pressed={glow} onClick={toggleGlow} title="Additive glow from fire and lava (G)">
          Glow
        </button>
        <button type="button" className="btn -ml-0.5" aria-pressed={scanlines} onClick={toggleScanlines} title="CRT scanline overlay (T)">
          CRT
        </button>
      </div>

      <SlotsDialog engine={engine} open={slotsOpen} onClose={() => setSlotsOpen(false)} />
    </header>
  )
}
