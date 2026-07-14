import type { RenderPort } from '@automata/engine'
import type { GameHost } from './host'

/**
 * The capability-pack interface v1 (factory Phase 3). Packs register against a
 * boot context and hand back a runtime handle; the composed runtime is driven
 * by the game loop. Player state flows IN as an argument, win-gating flows OUT
 * via objectivesComplete — no pack↔gameplay circular binding.
 */
export interface PackBootContext {
  host: GameHost
  render: RenderPort
}

export interface PackWorldState {
  playerPosition: { x: number; z: number }
}

export interface PackRuntimeHandle {
  fixedUpdate?(dt: number, world: PackWorldState): void
  render?(alpha: number): void
  /** Win-condition gate; the composed runtime ANDs all gates (vacuously true). */
  objectivesComplete?(): boolean
  dispose?(): void
}

export interface GamePack<TConfig = unknown> {
  id: string
  version: string
  /** Structural schema slot (zod-compatible); validated at boot when present. */
  configSchema?: { parse(input: unknown): TConfig }
  register(ctx: PackBootContext, config: TConfig): PackRuntimeHandle | void
}

export interface ComposedRuntime {
  packIds: readonly string[]
  fixedUpdate(dt: number, world: PackWorldState): void
  render(alpha: number): void
  objectivesComplete(): boolean
}

export interface ComposedPacks {
  packIds: readonly string[]
  boot(ctx: PackBootContext): ComposedRuntime
}

export function composePacks(packs: readonly GamePack[], configs: Record<string, unknown> = {}): ComposedPacks {
  const seen = new Set<string>()
  for (const pack of packs) {
    if (seen.has(pack.id)) throw new Error(`Duplicate pack id "${pack.id}"`)
    seen.add(pack.id)
  }
  const packIds = packs.map((pack) => pack.id)
  return {
    packIds,
    boot(ctx) {
      const handles: PackRuntimeHandle[] = []
      for (const pack of packs) {
        const config = pack.configSchema ? pack.configSchema.parse(configs[pack.id]) : configs[pack.id]
        const handle = pack.register(ctx, config as never)
        if (!handle) continue
        handles.push(handle)
        if (handle.dispose) ctx.host.cleanup.defer(() => handle.dispose!())
      }
      return {
        packIds,
        fixedUpdate(dt, world) { for (const handle of handles) handle.fixedUpdate?.(dt, world) },
        render(alpha) { for (const handle of handles) handle.render?.(alpha) },
        objectivesComplete() { return handles.every((handle) => handle.objectivesComplete?.() ?? true) }
      }
    }
  }
}
