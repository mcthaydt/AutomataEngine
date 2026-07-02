export interface FixtureAsset {
  id: string
  kind: string
  file: string
  width: number
  height: number
  frame: { x?: number; y?: number; width: number; height: number; columns: number; rows: number; count: number }
  animations: { name: string; start: number; count: number; durationS: number; loop: boolean }[]
  pixelLab: { resourceType: string; resourceId: string; jobIds: string[] }
  promptKey: string
  tags: string[]
}

function asset(id: string, kind: string, tags: string[], animations: FixtureAsset['animations'] = []): FixtureAsset {
  return {
    id,
    kind,
    file: `assets/${kind}/${id}.png`,
    width: 64,
    height: 64,
    frame: { width: 64, height: 64, columns: 1, rows: 1, count: 1 },
    animations,
    pixelLab: { resourceType: kind === 'keeper' ? 'character' : 'object', resourceId: `pixellab-${id}`, jobIds: [`job-${id}`] },
    promptKey: `prompt-${id}`,
    tags
  }
}

export function completeManifestFixture() {
  const keeperAnimations = ['idle', 'run', 'climb', 'carry', 'operate-repair'].map((name) => ({
    name, start: 0, count: 1, durationS: 0.1, loop: true
  }))
  const stations = ['beacon', 'radio', 'chart', 'breaker', 'workbench', 'generator', 'pump']
  const items = ['wrench', 'fuse', 'pump-handle', 'boards', 'coolant']
  const ships = ['cutter', 'trawler', 'steamer']
  const floors = ['lantern', 'navigation', 'quarters', 'workshop', 'machinery']
  const environments = ['sea', 'sky', 'storm-cloud', 'rocks', 'dawn']
  const effects = ['broken-glass', 'sparks', 'spray', 'rescue-flare', 'failure']
  return {
    version: 1,
    generator: 'PixelLab',
    assets: [
      asset('keeper', 'keeper', ['keeper'], keeperAnimations),
      asset('lighthouse-exterior', 'lighthouse', ['lighthouse:exterior']),
      asset('lighthouse-ladder', 'lighthouse', ['lighthouse:ladder']),
      ...floors.map((id) => asset(`floor-${id}`, 'lighthouse', [`floor:${id}`])),
      ...stations.flatMap((id) => ['active', 'damaged'].map((state) =>
        asset(`${id}-${state}`, 'station', [`station:${id}`, `state:${state}`]))),
      ...items.map((id) => asset(id, 'item', [`item:${id}`])),
      ...ships.map((id) => asset(`ship-${id}`, 'ship', [`ship:${id}`])),
      ...environments.map((id) => asset(id, 'environment', [`environment:${id}`])),
      ...effects.map((id) => asset(id, 'effect', [`effect:${id}`]))
    ]
  }
}
