import type { EngineEntity, Vec3 } from '@automata/engine'

export interface MovingPlatform {
  waypoints: Vec3[]
  speed: number
  mode: 'loop' | 'pingpong'
}

/** Game entity = engine mechanism components + game-meaning components. */
export interface Entity extends EngineEntity {
  /** Stable editor document item id, present only in editor-built worlds. */
  editorId?: string
  /** Player tag. Empty object: archetype components are YAML mappings. */
  ball?: Record<string, never>
  collectible?: { value: number }
  goal?: Record<string, never>
  bumper?: { impulseStrength: number }
  movingPlatform?: MovingPlatform
  spinAnim?: { speed: number }
}
