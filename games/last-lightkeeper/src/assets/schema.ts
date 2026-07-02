import { z } from '@automata/engine'

const animationSchema = z.object({
  name: z.string().min(1),
  start: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  durationS: z.number().positive(),
  loop: z.boolean()
})

const assetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['keeper', 'lighthouse', 'station', 'item', 'ship', 'environment', 'effect']),
  file: z.string().regex(/^assets\/[a-z0-9/-]+\.png$/, 'Asset file must be a local assets/*.png path'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frame: z.object({
    x: z.number().int().nonnegative().default(0),
    y: z.number().int().nonnegative().default(0),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
    count: z.number().int().positive()
  }),
  animations: z.array(animationSchema),
  pixelLab: z.object({
    resourceType: z.enum(['character', 'object', 'ui']),
    resourceId: z.string().min(1, 'PixelLab resource id is required'),
    jobIds: z.array(z.string().min(1))
  }),
  promptKey: z.string().min(1, 'Source prompt key is required'),
  tags: z.array(z.string().min(1)).min(1, 'At least one state tag is required')
}).superRefine((asset, context) => {
  if (asset.frame.x + asset.frame.width * asset.frame.columns > asset.width ||
      asset.frame.y + asset.frame.height * asset.frame.rows > asset.height ||
      asset.frame.count > asset.frame.columns * asset.frame.rows) {
    context.addIssue({ code: 'custom', message: `Frame geometry exceeds image dimensions for ${asset.id}` })
  }
  if (new Set(asset.animations.map((animation) => animation.name)).size !== asset.animations.length) {
    context.addIssue({ code: 'custom', message: `Animation names must be unique for ${asset.id}` })
  }
  for (const animation of asset.animations) {
    if (animation.start + animation.count > asset.frame.count) {
      context.addIssue({ code: 'custom', message: `Animation ${animation.name} exceeds frames for ${asset.id}` })
    }
  }
  if (new Set(asset.tags).size !== asset.tags.length) {
    context.addIssue({ code: 'custom', message: `State tags must be unique for ${asset.id}` })
  }
})

const REQUIRED_KEEPER_ANIMATIONS = ['idle', 'run', 'climb', 'carry', 'operate-repair'] as const
const REQUIRED_STATIONS = ['beacon', 'radio', 'chart', 'breaker', 'workbench', 'generator', 'pump'] as const
const REQUIRED_TAGS = [
  'lighthouse:exterior', 'lighthouse:ladder',
  ...['lantern', 'navigation', 'quarters', 'workshop', 'machinery'].map((id) => `floor:${id}`),
  ...REQUIRED_STATIONS.flatMap((id) => [`station:${id}`]),
  'state:active', 'state:damaged',
  ...['wrench', 'fuse', 'pump-handle', 'boards', 'coolant'].map((id) => `item:${id}`),
  ...['cutter', 'trawler', 'steamer'].map((id) => `ship:${id}`),
  ...['sea', 'sky', 'storm-cloud', 'rocks', 'dawn'].map((id) => `environment:${id}`),
  ...['broken-glass', 'sparks', 'spray', 'rescue-flare', 'failure'].map((id) => `effect:${id}`)
] as const

export const assetManifestSchema = z.object({
  version: z.literal(1),
  generator: z.literal('PixelLab'),
  assets: z.array(assetSchema).min(1)
}).superRefine((manifest, context) => {
  const ids = manifest.assets.map((asset) => asset.id)
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Asset ids must be unique; duplicate id found' })
  }
  const files = manifest.assets.map((asset) => asset.file)
  if (new Set(files).size !== files.length) {
    context.addIssue({ code: 'custom', message: 'Asset file paths must be unique' })
  }
  const keeperAnimations = new Set(
    manifest.assets.filter((asset) => asset.kind === 'keeper')
      .flatMap((asset) => asset.animations.map((animation) => animation.name))
  )
  for (const name of REQUIRED_KEEPER_ANIMATIONS) {
    if (!keeperAnimations.has(name)) {
      context.addIssue({ code: 'custom', message: `Missing keeper animation ${name}` })
    }
  }
  const tags = new Set(manifest.assets.flatMap((asset) => asset.tags))
  for (const tag of REQUIRED_TAGS) {
    if (!tags.has(tag)) context.addIssue({ code: 'custom', message: `Missing required asset tag ${tag}` })
  }
  for (const station of REQUIRED_STATIONS) {
    for (const state of ['active', 'damaged'] as const) {
      if (!manifest.assets.some((asset) =>
        asset.tags.includes(`station:${station}`) && asset.tags.includes(`state:${state}`)
      )) {
        context.addIssue({ code: 'custom', message: `Missing ${station} ${state} asset state` })
      }
    }
  }
})

export type AssetManifest = z.infer<typeof assetManifestSchema>
export type AssetEntry = AssetManifest['assets'][number]

export function parseAssetManifest(input: unknown): AssetManifest {
  return assetManifestSchema.parse(input)
}
