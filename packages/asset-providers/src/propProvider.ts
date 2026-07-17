import type { AssetProvider, ProviderContext, StyleParams } from '@automata/contracts'
import { createSeededRng, type SeededRng } from '@automata/engine'
import { hsl } from './svgProvider'
import type { PropRecipe } from './propRecipe'

const round2 = (value: number): number => Math.round(value * 100) / 100
const jitter = (rng: SeededRng, base: number): number =>
  round2(base * (0.8 + rng.next() * 0.4))

type Parts = PropRecipe['parts']

/** Four compact silhouette templates whose proportions vary by child seed. */
function buildParts(rng: SeededRng, palette: StyleParams['palette']): Parts {
  const body = hsl(palette.baseHue, palette.saturation, palette.lightness)
  const trim = hsl(
    palette.accentHues[rng.nextInt(palette.accentHues.length)]!,
    palette.saturation,
    palette.lightness
  )
  const template = rng.nextInt(4)
  if (template === 0) {
    const size = jitter(rng, 1)
    return [
      {
        primitive: 'box',
        size: { x: size, y: size, z: size },
        offset: { x: 0, y: round2(size / 2), z: 0 },
        color: body
      },
      {
        primitive: 'box',
        size: {
          x: round2(size * 1.04),
          y: round2(size * 0.1),
          z: round2(size * 1.04)
        },
        offset: { x: 0, y: round2(size * 1.05), z: 0 },
        color: trim
      }
    ]
  }
  if (template === 1) {
    const radius = jitter(rng, 0.45)
    const height = jitter(rng, 1.1)
    return [
      {
        primitive: 'cylinder',
        radius,
        height,
        offset: { x: 0, y: round2(height / 2), z: 0 },
        color: body
      },
      {
        primitive: 'cylinder',
        radius: round2(radius * 1.06),
        height: 0.06,
        offset: { x: 0, y: round2(height * 0.25), z: 0 },
        color: trim
      },
      {
        primitive: 'cylinder',
        radius: round2(radius * 1.06),
        height: 0.06,
        offset: { x: 0, y: round2(height * 0.75), z: 0 },
        color: trim
      }
    ]
  }
  if (template === 2) {
    const height = jitter(rng, 2.2)
    return [
      {
        primitive: 'cylinder',
        radius: 0.08,
        height,
        offset: { x: 0, y: round2(height / 2), z: 0 },
        color: body
      },
      {
        primitive: 'sphere',
        radius: jitter(rng, 0.3),
        offset: { x: 0, y: round2(height + 0.2), z: 0 },
        color: trim
      }
    ]
  }
  const base = jitter(rng, 0.9)
  const mid = round2(base * 0.75)
  const top = round2(base * 0.5)
  return [
    {
      primitive: 'box',
      size: { x: base, y: base, z: base },
      offset: { x: 0, y: round2(base / 2), z: 0 },
      color: body
    },
    {
      primitive: 'box',
      size: { x: mid, y: mid, z: mid },
      offset: {
        x: round2(base * 0.1),
        y: round2(base + mid / 2),
        z: round2(base * -0.05)
      },
      color: body
    },
    {
      primitive: 'box',
      size: { x: top, y: top, z: top },
      offset: {
        x: round2(base * -0.08),
        y: round2(base + mid + top / 2),
        z: round2(base * 0.06)
      },
      color: trim
    }
  ]
}

export const propProvider: AssetProvider = {
  id: 'procedural-prop',
  version: '1.0.0',
  kinds: ['model'],
  fileExtension: () => 'prop.json',
  async generate(requirement, ctx: ProviderContext) {
    const rng = createSeededRng(ctx.seed)
    const recipe: PropRecipe = {
      formatVersion: 1,
      parts: buildParts(rng, ctx.style.palette)
    }
    return {
      bytes: new TextEncoder().encode(`${JSON.stringify(recipe, null, 2)}\n`),
      provenance: {
        provider: propProvider.id,
        providerVersion: propProvider.version,
        generator: 'prop-recipe@1',
        sourceParams: { kind: requirement.kind },
        seed: ctx.seed,
        specVersion: ctx.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally generated.' }
      }
    }
  }
}
