import type {
  AssetProvider,
  AssetRequirement,
  ProviderContext,
  StyleParams
} from '@automata/contracts'
import { createSeededRng, type SeededRng } from '@automata/engine'
import { detSin } from './deterministicSine'

export const hsl = (hue: number, saturation: number, lightness: number): string =>
  `hsl(${hue} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`

/** Every literal color the procedural SVG provider may emit for this style. */
export function svgPaletteColors(style: StyleParams): string[] {
  const { baseHue, accentHues, saturation, lightness } = style.palette
  return [
    hsl(baseHue, saturation, lightness),
    ...accentHues.map((hue) => hsl(hue, saturation, lightness))
  ]
}

const fixed = (value: number): string => value.toFixed(2)
const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** Seeded N-gon emblem on a rounded backdrop; all colors come from the palette. */
function drawIcon(rng: SeededRng, palette: StyleParams['palette']): string {
  const points = 5 + rng.nextInt(4)
  const outer = 13
  const inner = 6 + rng.next() * 4
  const coords: string[] = []
  for (let index = 0; index < points * 2; index += 1) {
    const phase = index / (points * 2)
    const radius = index % 2 === 0 ? outer : inner
    coords.push(
      `${fixed(16 + radius * detSin(phase + 0.25))},${fixed(16 + radius * detSin(phase))}`
    )
  }
  const accentIndex = rng.nextInt(palette.accentHues.length)
  const accent = palette.accentHues[accentIndex]!
  const outline = palette.accentHues[(accentIndex + 1) % palette.accentHues.length]!
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n` +
    `  <rect x="1" y="1" width="30" height="30" rx="6" fill="${hsl(palette.baseHue, palette.saturation, palette.lightness)}"/>\n` +
    `  <polygon points="${coords.join(' ')}" fill="${hsl(accent, palette.saturation, palette.lightness)}" stroke="${hsl(outline, palette.saturation, palette.lightness)}" stroke-width="1"/>\n` +
    `</svg>\n`
}

/** Seeded tileable pattern: offset rows of circles over a base fill. */
function drawTexture(rng: SeededRng, palette: StyleParams['palette']): string {
  const cell = 8 + rng.nextInt(9)
  const radius = fixed(cell * (0.2 + rng.next() * 0.2))
  const accent = palette.accentHues[rng.nextInt(palette.accentHues.length)]!
  const dot = hsl(accent, palette.saturation, palette.lightness)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n` +
    `  <pattern id="p" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse">\n` +
    `    <rect width="${cell * 2}" height="${cell * 2}" fill="${hsl(palette.baseHue, palette.saturation, palette.lightness)}"/>\n` +
    `    <circle cx="${fixed(cell / 2)}" cy="${fixed(cell / 2)}" r="${radius}" fill="${dot}"/>\n` +
    `    <circle cx="${fixed(cell * 1.5)}" cy="${fixed(cell * 1.5)}" r="${radius}" fill="${dot}"/>\n` +
    `  </pattern>\n` +
    `  <rect width="64" height="64" fill="url(#p)"/>\n` +
    `</svg>\n`
}

export const svgProvider: AssetProvider = {
  id: 'procedural-svg',
  version: '1.0.1',
  kinds: ['ui', 'texture'],
  fileExtension: () => 'svg',
  async generate(requirement: AssetRequirement, ctx: ProviderContext) {
    const rng = createSeededRng(ctx.seed)
    const text = requirement.kind === 'texture'
      ? drawTexture(rng, ctx.style.palette)
      : drawIcon(rng, ctx.style.palette)
    return {
      bytes: encode(text),
      provenance: {
        provider: svgProvider.id,
        providerVersion: svgProvider.version,
        generator: requirement.kind === 'texture' ? 'svg-pattern@1' : 'svg-emblem@1',
        sourceParams: { kind: requirement.kind },
        seed: ctx.seed,
        specVersion: ctx.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally generated.' }
      }
    }
  }
}
