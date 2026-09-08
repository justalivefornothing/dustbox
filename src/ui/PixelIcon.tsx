/**
 * 8x8 pixel-art glyphs for the element dock, drawn as SVG rects with
 * crispEdges so they scale as chunky blocks. Each glyph is a tiny sprite
 * sheet in text: '#' main colour, '+' highlight, '-' shadow, '.' transparent.
 */
import { E } from '../sim/species'

const GLYPHS: Record<number, readonly string[]> = {
  [E.Wall]: ['########', '#-#-#-#-', '########', '-#-#-#-#', '########', '#-#-#-#-', '########', '-#-#-#-#'],
  [E.Sand]: ['........', '...+....', '..+#....', '..##+...', '.+###+..', '.####+#.', '+######-', '########'],
  [E.Water]: ['........', '.++..++.', '+..++..+', '........', '..++..++', '.+..++..', '########', '-#-##-#-'],
  [E.Oil]: ['....#...', '...##...', '...##...', '..####..', '.######.', '.####-#.', '.##--##.', '..####..'],
  [E.Fire]: ['...+....', '..++.#..', '..+##+..', '.+####+.', '.#+##++.', '.#++#+#.', '.-#++#-.', '..-##-..'],
  [E.Smoke]: ['..++....', '.+..+...', '+....+..', '.+..+.+.', '..++..+.', '.+.++.+.', '+.+..+..', '.+....+.'],
  [E.Plant]: ['...+....', '..+#+...', '.+###+..', '..+#+.#.', '...#.##.', '...###..', '....#...', '..-###-.'],
  [E.Acid]: ['..+.....', '.....+..', '..+..+..', '.+#+#+..', '+######+', '#+#-#-##', '########', '.######.'],
  [E.Lava]: ['..####..', '.#+###+.', '##+#+###', '#+###+##', '###+#+##', '#+##+###', '.##+##+.', '..####..'],
  [E.Stone]: ['..+++...', '.+++###.', '++######', '+######-', '#######-', '####-##-', '.######.', '..----..'],
  [E.Ice]: ['...+....', '..+#+...', '.+#+#+..', '+#+#+#+.', '.+###+..', '..+#+...', '...+....', '.-....-.'],
  [E.Gas]: ['.+...+..', '...+....', '.+.....+', '...+..+.', '.....+..', '..+.....', '+...+.+.', '...+....'],
  // Eraser (Empty)
  [E.Empty]: ['........', '.....+++', '....+##-', '...+##-.', '..+##-..', '.+##-...', '.##-....', '.--.....'],
}

function shade(hex: [number, number, number], k: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `rgb(${c(hex[0])} ${c(hex[1])} ${c(hex[2])})`
}

export interface PixelIconProps {
  species: number
  color: readonly [number, number, number]
  size?: number
  className?: string
}

export function PixelIcon({ species, color, size = 32, className }: PixelIconProps) {
  const rows = GLYPHS[species] ?? GLYPHS[E.Empty]
  const base: [number, number, number] = [color[0], color[1], color[2]]
  const main = shade(base, 1)
  const light = shade(base, 1.45)
  const dark = shade(base, 0.6)
  const rects: React.ReactElement[] = []
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const ch = row[x]
      if (ch === '.') continue
      const fill = ch === '#' ? main : ch === '+' ? light : dark
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />)
    }
  })
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {rects}
    </svg>
  )
}
