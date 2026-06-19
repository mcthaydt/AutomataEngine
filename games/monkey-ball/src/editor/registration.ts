import {
  createWorld, registerPhysicsBodies, type ArchetypeLibrary, type PhysicsPort, type RenderPort
} from '@automata/engine'
import type { GameDefinition, Surface } from '@automata/editor'
import type { PhysicsTuning } from '../data/config'
import type { Level } from '../data/level'
import type { Entity } from '../entity'
import { populateLevelWorld } from '../level/buildWorld'
import { levelSceneModel } from './sceneModel'

const swatch = (value: string): Surface => ({ kind: 'color', value })
const MANY = { min: 0, max: Number.POSITIVE_INFINITY }
type EditorEntity = Entity & { editorId?: string }

/** Build a definition once boot data is available. */
export function createMonkeyBallDefinition(
  lib: ArchetypeLibrary,
  _tuning: PhysicsTuning
): GameDefinition<Level> {
  void _tuning
  return {
    id: 'monkey-ball',
    scene: levelSceneModel,
    palette: {
      geometry: [
        { id: 'box', label: 'Floor / Box', kind: 'box', place: 'point', cardinality: MANY },
        { id: 'cylinder', label: 'Cylinder', kind: 'cylinder', place: 'point', cardinality: MANY }
      ],
      archetypes: [
        { id: 'banana', label: 'Banana', kind: 'archetype', place: 'point', ref: 'banana', cardinality: MANY },
        { id: 'bumper', label: 'Bumper', kind: 'archetype', place: 'point', ref: 'bumper', cardinality: MANY },
        {
          id: 'moving-platform',
          label: 'Moving Platform',
          kind: 'archetype',
          place: 'point',
          ref: 'moving-platform',
          cardinality: MANY
        }
      ],
      markers: [
        { id: 'spawn', label: 'Spawn', kind: 'marker', place: 'point', ref: 'spawn', cardinality: { min: 1, max: 1 } },
        { id: 'goal', label: 'Goal', kind: 'marker', place: 'point', ref: 'goal', cardinality: { min: 1, max: 1 } }
      ]
    },
    surfacePalette: ['#7ec850', '#4ecdc4', '#ff5964', '#ffd23f', '#9b5de5', '#cfd8ff'].map(swatch),
    buildWorld(level: Level, render: RenderPort, physics: PhysicsPort) {
      const world = createWorld<EditorEntity>()
      registerPhysicsBodies(world, physics)
      populateLevelWorld(world, level, lib, { editorIds: true })
      void render
      return world
    },
    resolveSurface(surface) {
      if (surface.kind === 'color') return { color: surface.value }
      throw new Error(`unsupported surface kind ${surface.kind}`)
    }
  }
}
