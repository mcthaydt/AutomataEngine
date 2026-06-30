// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archetypeLibraryKind, parseData } from '@automata/engine'
import { buildLevelWorld } from '../../src/level/buildWorld'
import { runHeadlessPlay } from '../../src/level/headlessPlay'
import { loadMonkeyBallProject } from '../../src/project/load'
import { readDataFile } from '../helpers/data'
import type { Level } from '../../src/project/legacyTypes'

const lib = parseData(archetypeLibraryKind, readDataFile('archetypes/standard.yaml'), 'standard.yaml')
const root = resolve(import.meta.dirname, '../../public/project')
const project = await loadMonkeyBallProject({ readText: (path) => readFile(resolve(root, path), 'utf8') })
const levelIds = project.manifest.worlds.flatMap((world) => world.levels)
const EPS = 0.0001

interface Range { min: number; max: number }
interface VecLike { x: number; y: number; z: number }

function range(center: number, size: number): Range {
  return { min: center - size / 2, max: center + size / 2 }
}

function touchesOrOverlaps(a: Range, b: Range): boolean {
  return a.min <= b.max + EPS && b.min <= a.max + EPS
}

function asVec(value: unknown): VecLike {
  expect(value).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })
  return value as VecLike
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toEqual(expect.any(Object))
  return value as Record<string, unknown>
}

function movingPlatformSize(): VecLike {
  const platform = asRecord(lib['moving-platform'])
  const rigidBody = asRecord(platform.rigidBody)
  const shape = asRecord(rigidBody.shape)
  const halfExtents = asVec(shape.halfExtents)
  return { x: halfExtents.x * 2, y: halfExtents.y * 2, z: halfExtents.z * 2 }
}

function movingPlatformWaypoints(entity: Level['entities'][number]): VecLike[] {
  const movingPlatform = entity.overrides?.movingPlatform as { waypoints?: unknown } | undefined
  expect(movingPlatform?.waypoints).toEqual(expect.any(Array))
  return (movingPlatform!.waypoints as unknown[]).map(asVec)
}

function endpointTouchesDeck(level: Level, endpoint: VecLike): boolean {
  const platform = movingPlatformSize()
  const platformX = range(endpoint.x, platform.x)
  const platformZ = range(endpoint.z, platform.z)
  return level.geometry.some((g) => {
    if (g.shape !== 'box') return false
    return touchesOrOverlaps(platformX, range(g.pos[0], g.size[0]))
      && touchesOrOverlaps(platformZ, range(g.pos[2], g.size[2]))
  })
}

describe('shipped content', () => {
  it('has 2 worlds of 3 levels each', () => {
    expect(project.manifest.worlds).toHaveLength(2)
    for (const world of project.manifest.worlds) expect(world.levels).toHaveLength(3)
  })

  it.each(levelIds)('level %s parses and builds a world', (id) => {
    const level = project.levels[id]!
    expect(level.id).toBe(id)
    const { world } = buildLevelWorld(level, lib)
    expect([...world.with('ball')]).toHaveLength(1)
    expect([...world.with('goal')]).toHaveLength(1)
  })

  it.each(levelIds)('level %s rests on solid ground with no input (metric smoke)', async (id) => {
    const level = project.levels[id]!
    const result = await runHeadlessPlay(level, lib, project.tuning, { maxSteps: 180 })
    expect(result.outcome).toBe('incomplete')
    expect(result.fallCount).toBe(0)
    expect(result.steps).toBe(180)
  }, 20000)

  it.each(levelIds)('level %s moving platforms touch the decks they bridge', (id) => {
    const level = project.levels[id]!
    for (const entity of level.entities.filter((e) => e.archetype === 'moving-platform')) {
      for (const endpoint of movingPlatformWaypoints(entity)) {
        expect(endpointTouchesDeck(level, endpoint)).toBe(true)
      }
    }
  })

  it('w2-l3 uses a compact center bumper for the narrow bridge', () => {
    const level = project.levels['w2-l3']!
    const { world } = buildLevelWorld(level, lib)
    const bumper = [...world.with('bumper', 'renderable', 'rigidBody')][0]!
    expect(bumper.renderable).toMatchObject({ primitive: 'cylinder', radius: 0.4, height: 0.35 })
    expect(bumper.rigidBody).toMatchObject({
      shape: { type: 'cylinder', radius: 0.4, halfHeight: 0.175 }
    })
  })
})
