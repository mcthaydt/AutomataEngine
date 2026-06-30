import type { ProjectSnapshot } from '@automata/project'
import type { Level, PhysicsTuning, WorldsManifest } from './types'
import { importLegacyMonkeyBallProject } from './legacyImporter'

const DEFAULT_TUNING: PhysicsTuning = {
  maxTiltRad: (12 * Math.PI) / 180,
  tiltSmooth: 0.15,
  gravity: 9.81,
  ball: { radius: 0.5, friction: 0.6 }
}

const DEFAULT_MANIFEST: WorldsManifest = {
  worlds: [{ id: 'w1', name: 'Grassland', levels: ['w1-l1'] }]
}

const DEFAULT_LEVEL: Level = {
  id: 'w1-l1',
  name: 'First Roll',
  timeLimitS: 60,
  fallY: -10,
  spawn: [0, 1, 6],
  goal: { pos: [0, 0, -6] },
  geometry: [{ shape: 'box', size: [8, 0.5, 16], pos: [0, -0.25, 0], color: '#7ec850', friction: 0.6 }],
  entities: []
}

/** A small valid project used by the shared editor's New Project action. */
export function createMonkeyBallTemplate(): ProjectSnapshot {
  return importLegacyMonkeyBallProject({
    tuning: DEFAULT_TUNING,
    manifest: DEFAULT_MANIFEST,
    levels: { 'w1-l1': DEFAULT_LEVEL }
  })
}
