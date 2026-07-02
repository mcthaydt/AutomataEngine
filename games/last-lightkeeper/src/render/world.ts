import type { SpritePose, SpriteRenderPort, SpriteSourceRect } from '@automata/engine'
import { nightDefinition } from '../data/night'
import { parseAssetManifest, type AssetEntry } from '../assets/schema'
import type { NightState } from '../state/night'

const FLOOR_IDS = ['lantern', 'navigation', 'quarters', 'workshop', 'machinery'] as const
const STATION_IDS = ['beacon', 'radio', 'chart', 'breaker', 'workbench', 'generator', 'pump'] as const
const ITEM_IDS = ['wrench', 'fuse', 'pump-handle', 'boards', 'coolant'] as const
const SHIP_IDS = ['cutter', 'trawler', 'steamer'] as const

export const WORLD_SPRITE_COUNT = 34

export interface WorldPresentation {
  entity(id: string): object
  update(state: NightState, alpha: number): void
  dispose(): void
}

function source(asset: AssetEntry, index = 0): SpriteSourceRect {
  const column = index % asset.frame.columns
  const row = Math.floor(index / asset.frame.columns)
  return {
    x: asset.frame.x + column * asset.frame.width,
    y: asset.frame.y + row * asset.frame.height,
    width: asset.frame.width,
    height: asset.frame.height
  }
}

function pose(x: number, y: number, layer: number, depth = 0): SpritePose {
  return { x, y, layer, depth, scaleX: 1, scaleY: 1, rotationRad: 0 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createWorldPresentation(port: SpriteRenderPort, input: unknown): WorldPresentation {
  const manifest = parseAssetManifest(input)
  const assets = new Map(manifest.assets.map((asset) => [asset.id, asset]))
  const entities = new Map<string, object>()
  let previousKeeper: { x: number; y: number } | null = null

  const add = (
    id: string,
    assetId: string,
    frameIndex: number,
    width: number,
    height: number,
    spritePose: SpritePose
  ) => {
    const asset = assets.get(assetId)
    if (asset === undefined) throw new Error(`Missing world asset ${assetId}`)
    const entity = {}
    entities.set(id, entity)
    port.add(entity, {
      textureId: assetId,
      frame: source(asset, frameIndex),
      width,
      height,
      pivot: { x: 0.5, y: 0.5 }
    })
    port.setPose(entity, spritePose)
  }

  add('sky', 'storm-layers', 0, 256, 256, pose(0, 135, 0))
  add('sea', 'storm-layers', 0, 256, 80, pose(0, 22, 1))
  add('rocks', 'storm-layers', 0, 256, 64, pose(0, 34, 2))
  add('rain', 'storm-effects', 9, 192, 128, pose(0, 150, 5))
  add('tower', 'lighthouse-modules', 0, 176, 240, pose(0, 120, 10))
  FLOOR_IDS.forEach((id, index) => {
    const floor = nightDefinition.floors.find((candidate) => candidate.id === id)!
    add(`floor:${id}`, 'lighthouse-modules', index + 2, floor.xMax - floor.xMin, 48, pose(0, floor.y, 11, index))
  })
  nightDefinition.ladders.forEach((ladder, index) => {
    const from = nightDefinition.floors.find((floor) => floor.id === ladder.from)!
    const to = nightDefinition.floors.find((floor) => floor.id === ladder.to)!
    add(`ladder:${ladder.id}`, 'lighthouse-modules', 1, 16, Math.abs(to.y - from.y), pose(ladder.x, (from.y + to.y) / 2, 20, index))
  })
  STATION_IDS.forEach((id, index) => {
    const station = nightDefinition.stations.find((candidate) => candidate.id === id)!
    const floor = nightDefinition.floors.find((candidate) => candidate.id === station.floor)!
    add(`station:${id}`, 'machinery-states', index * 2, 32, 32, pose(station.x, floor.y + 14, 30, index))
  })
  ITEM_IDS.forEach((id, index) => {
    const item = nightDefinition.items.find((candidate) => candidate.id === id)!
    const floor = nightDefinition.floors.find((candidate) => candidate.id === item.floor)!
    add(`item:${id}`, 'repair-items', index, 20, 20, pose(item.x, floor.y + 12, 31, index))
  })
  add('water', 'storm-layers', 0, 176, 48, pose(0, 24, 32))
  add('keeper', 'keeper-idle-0', 0, 48, 48, pose(0, 120, 40))
  add('carried-item', 'repair-items', 5, 18, 18, pose(0, 136, 41))
  SHIP_IDS.forEach((id, index) => add(`ship:${id}`, 'rescue-ships', index, 96, 32, pose(index % 2 === 0 ? 145 : -145, 72 + index * 34, 50, index)))
  add('beacon-cone', 'storm-effects', 8, 160, 48, pose(70, 220, 55))
  add('effects', 'storm-effects', 0, 64, 64, pose(0, 160, 60))

  if (entities.size !== WORLD_SPRITE_COUNT) {
    throw new Error(`World sprite count mismatch: ${entities.size}`)
  }

  const requiredEntity = (id: string): object => {
    const entity = entities.get(id)
    if (entity === undefined) throw new Error(`Unknown world sprite ${id}`)
    return entity
  }

  return {
    entity: requiredEntity,

    update(state, alpha) {
      const renderAlpha = clamp(alpha, 0, 1)
      const prior = previousKeeper ?? state.keeper
      const keeperX = prior.x + (state.keeper.x - prior.x) * renderAlpha
      const keeperY = prior.y + (state.keeper.y - prior.y) * renderAlpha
      previousKeeper = { x: state.keeper.x, y: state.keeper.y }

      const keeperAssetId = `keeper-${state.keeper.mode === 'operate' ? 'operate' : state.keeper.mode}-0`
      const keeperAsset = assets.get(keeperAssetId) ?? assets.get('keeper-idle-0')!
      port.setFrame(requiredEntity('keeper'), keeperAsset.id, source(keeperAsset))
      port.setPose(requiredEntity('keeper'), {
        ...pose(keeperX, keeperY + 20, 40),
        scaleX: state.keeper.facing
      })

      const damagedStations = new Set(Object.values(state.activeFailures).flatMap((active) => {
        if (active === undefined) return []
        return [nightDefinition.failures.find((failure) => failure.id === active.id)!.station]
      }))
      const stationSheet = assets.get('machinery-states')!
      STATION_IDS.forEach((id, index) => {
        port.setFrame(requiredEntity(`station:${id}`), stationSheet.id, source(stationSheet, index * 2 + (damagedStations.has(id) ? 1 : 0)))
      })

      ITEM_IDS.forEach((id) => port.setVisible(requiredEntity(`item:${id}`), state.items[id] === 'racked'))
      const carriedIndex = state.keeper.carriedItem === null ? -1 : ITEM_IDS.indexOf(state.keeper.carriedItem)
      port.setVisible(requiredEntity('carried-item'), carriedIndex >= 0)
      if (carriedIndex >= 0) {
        const itemSheet = assets.get('repair-items')!
        port.setFrame(requiredEntity('carried-item'), itemSheet.id, source(itemSheet, 5 + carriedIndex))
        port.setPose(requiredEntity('carried-item'), pose(keeperX + state.keeper.facing * 11, keeperY + 28, 41))
      }

      port.setPose(requiredEntity('water'), {
        ...pose(0, 24, 32),
        scaleY: clamp(state.flooding / 100, 0, 1)
      })
      port.setVisible(requiredEntity('water'), state.flooding > 0)

      SHIP_IDS.forEach((visual) => {
        const visible = nightDefinition.calls.some((call) => {
          const status = state.calls[call.id]?.status
          return call.shipVisual === visual && status !== undefined && !['pending', 'rescued', 'lost'].includes(status)
        })
        port.setVisible(requiredEntity(`ship:${visual}`), visible)
      })
      port.setVisible(requiredEntity('effects'), state.feedback.length > 0)
      port.setVisible(requiredEntity('beacon-cone'), state.circuits.beacon.powered &&
        state.activeCallId !== null && state.calls[state.activeCallId]?.status === 'guiding')

      const sky = state.timeS >= 690 ? assets.get('dawn')! : assets.get('storm-layers')!
      port.setFrame(requiredEntity('sky'), sky.id, source(sky))
    },

    dispose() {
      for (const entity of entities.values()) port.remove(entity)
      entities.clear()
      previousKeeper = null
    }
  }
}
