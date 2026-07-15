import { createSeededRng, type SeededRng } from '@automata/engine'
import type { AssetManifest, CompositionManifest, GameSpec } from '@automata/contracts'
import { composeInventorySection, interactionInventoryPack } from '@automata/pack-interaction-inventory'

export interface ComposedFile { path: string; text: string }
export interface ComposeIssue { code: string; message: string }
export type ComposeResult =
  | { ok: true; composition: CompositionManifest; assetManifest: AssetManifest; files: ComposedFile[]; summary: { packIds: string[]; itemCount: number; assetIds: string[] } }
  | { ok: false; issues: ComposeIssue[] }

/** Scaffold-template base content the slice composes over (single source: tools/scaffold templates). */
const ARENA = { half: 12, spawn: { x: -8, z: -8 } }
const BASE_TUNING = { moveSpeed: 6, goalRadius: 1.5, timeLimitS: 30, colors: { floor: '#12203a', player: '#27e0ff', goal: '#ffd23f' } }

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
const round2 = (value: number): number => Math.round(value * 100) / 100

/** Seeded goal in the quadrant opposite spawn; always inside the arena. */
const drawGoal = (rng: SeededRng): { x: number; z: number } =>
  ({ x: round2(2 + rng.next() * 8), z: round2(2 + rng.next() * 8) })

const drawIconSvg = (rng: SeededRng): string => {
  const hue = Math.floor(rng.next() * 360)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n` +
    `  <circle cx="16" cy="16" r="12" fill="hsl(${hue} 90% 60%)" stroke="#ffffff" stroke-width="2"/>\n` +
    `</svg>\n`
}

/** Pure spec→artifacts compose. RNG draw order: goal position → icon hue → item placements. */
export function composeGame(args: { spec: GameSpec; seed: number; specHash: string }): ComposeResult {
  const { spec, seed, specHash } = args
  const unsupported = spec.capabilities.filter((entry) => entry.id !== interactionInventoryPack.id)
  if (unsupported.length > 0) {
    return {
      ok: false,
      issues: unsupported.map((entry) => ({
        code: 'compose-unsupported-capability',
        message: `Phase 3 composes only "interaction-inventory"; spec selects "${entry.id}"`
      }))
    }
  }

  const rng = createSeededRng(seed)
  const goal = drawGoal(rng)
  const uiAssets = spec.assets.filter((asset) => asset.kind === 'ui')
  const assetFiles: ComposedFile[] = []
  const assetManifest: AssetManifest = { formatVersion: 1, assets: [] }
  for (const requirement of uiAssets) {
    const path = `assets/${requirement.id}.svg`
    assetFiles.push({ path: `public/${path}`, text: drawIconSvg(rng) })
    assetManifest.assets.push({
      id: requirement.id, requirement, path,
      provenance: { provider: 'stub-generator', generator: 'svg-icon@1', specVersion: spec.specVersion, seed },
      validation: { status: 'placeholder' }
    })
  }
  const iconPath = assetManifest.assets[0]?.path ?? null
  const selection = spec.capabilities[0]!
  const packConfig = composeInventorySection({
    specConfig: selection.config as { requiredItems?: number; interactRadius?: number },
    arena: { half: ARENA.half, spawn: ARENA.spawn, goal },
    iconPath
  }, rng)

  const composition: CompositionManifest = {
    formatVersion: 1,
    gameId: spec.identity.id,
    source: { specVersion: spec.specVersion, specHash, seed },
    packs: [{ id: interactionInventoryPack.id, version: interactionInventoryPack.version, config: packConfig as unknown as Record<string, unknown> }],
    assets: assetManifest.assets.map((entry) => ({ id: entry.id, path: entry.path }))
  }
  const tuningResource = {
    id: 'tuning', typeId: `${spec.identity.id}.tuning`,
    data: { arenaHalf: ARENA.half, moveSpeed: BASE_TUNING.moveSpeed, goal, goalRadius: BASE_TUNING.goalRadius, timeLimitS: BASE_TUNING.timeLimitS, colors: BASE_TUNING.colors }
  }
  const files: ComposedFile[] = [
    { path: 'public/project/resources/tuning.resource.json', text: json(tuningResource) },
    { path: 'public/project/composition.json', text: json(composition) },
    ...assetFiles,
    { path: 'public/assets/assets.json', text: json(assetManifest) }
  ]
  return {
    ok: true, composition, assetManifest, files,
    summary: { packIds: composition.packs.map((entry) => entry.id), itemCount: packConfig.items.length, assetIds: assetManifest.assets.map((entry) => entry.id) }
  }
}
