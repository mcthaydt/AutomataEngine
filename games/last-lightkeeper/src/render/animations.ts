import type { SpriteAnimation, SpriteSourceRect } from '@automata/engine'
import type { StationId } from '../data/schema'
import { parseAssetManifest } from '../assets/schema'
import type { KeeperMode } from '../state/night'

export type KeeperAnimationName = 'idle' | 'run' | 'climb' | 'carry' | 'operate-repair'
export type ShipVisual = 'cutter' | 'trawler' | 'steamer'
export type EffectAnimationName = 'rescue' | 'failure' | 'sparks'

const STATIONS: readonly StationId[] = ['beacon', 'radio', 'chart', 'breaker', 'workbench', 'generator', 'pump']
const SHIPS: readonly ShipVisual[] = ['cutter', 'trawler', 'steamer']

function frameIndex(tags: readonly string[]): number {
  const tag = tags.find((candidate) => candidate.startsWith('frame:'))
  return tag === undefined ? 0 : Number(tag.slice('frame:'.length))
}

export function createKeeperAnimations(input: unknown): Record<KeeperAnimationName, SpriteAnimation> {
  const manifest = parseAssetManifest(input)
  const create = (name: KeeperAnimationName): SpriteAnimation => {
    const assets = manifest.assets
      .filter((asset) => asset.tags.includes(`keeper:${name}`))
      .sort((left, right) => frameIndex(left.tags) - frameIndex(right.tags))
    return {
      name,
      loop: true,
      frames: assets.map((asset) => ({
        textureId: asset.id,
        source: {
          x: asset.frame.x,
          y: asset.frame.y,
          width: asset.frame.width,
          height: asset.frame.height
        },
        durationS: asset.animations.find((animation) => animation.name === name)!.durationS
      }))
    }
  }
  return {
    idle: create('idle'),
    run: create('run'),
    climb: create('climb'),
    carry: create('carry'),
    'operate-repair': create('operate-repair')
  }
}

export function keeperAnimationForMode(mode: KeeperMode): KeeperAnimationName {
  return mode === 'operate' ? 'operate-repair' : mode
}

export function stationFrame(id: StationId, damaged: boolean): SpriteSourceRect {
  const index = STATIONS.indexOf(id) * 2 + (damaged ? 1 : 0)
  return { x: (index % 4) * 64, y: Math.floor(index / 4) * 64, width: 64, height: 64 }
}

export function shipFrame(visual: ShipVisual): SpriteSourceRect {
  return { x: 0, y: SHIPS.indexOf(visual) * 85, width: 256, height: 85 }
}

export function createOneShotEffectAnimation(
  input: unknown,
  name: EffectAnimationName
): SpriteAnimation {
  const manifest = parseAssetManifest(input)
  const sheet = manifest.assets.find((asset) => asset.id === 'storm-effects')!
  const indices: Record<EffectAnimationName, number[]> = {
    rescue: [3, 8, 11],
    failure: [4, 6, 7],
    sparks: [1, 8]
  }
  return {
    name,
    loop: false,
    frames: indices[name].map((index) => ({
      textureId: sheet.id,
      source: {
        x: sheet.frame.x + index % sheet.frame.columns * sheet.frame.width,
        y: sheet.frame.y + Math.floor(index / sheet.frame.columns) * sheet.frame.height,
        width: sheet.frame.width,
        height: sheet.frame.height
      },
      durationS: 0.08
    }))
  }
}
