import type { GameHost } from './host'

/**
 * The pack-composition runtime seam (factory Phase 1). Phase 1 ships the seam
 * empty: composing zero packs is the status quo. Later phases compose real
 * capability packs through this stable registration contract.
 */
export interface GamePack<TConfig = unknown> {
  id: string
  version: string
  /** Structural schema slot (zod-compatible); validated at boot when present. */
  configSchema?: { parse(input: unknown): TConfig }
  /** Contribute systems/resources at boot; returned cleanup joins the host stack. */
  register(host: GameHost, config: TConfig): void | (() => void)
}
export interface ComposedPacks { packIds: readonly string[]; boot(host: GameHost): void }
export function composePacks(packs: readonly GamePack[], configs: Record<string, unknown> = {}): ComposedPacks {
  const seen = new Set<string>()
  for (const pack of packs) { if (seen.has(pack.id)) throw new Error(`Duplicate pack id "${pack.id}"`); seen.add(pack.id) }
  return { packIds: packs.map((pack) => pack.id), boot(host) {
    for (const pack of packs) {
      const config = pack.configSchema ? pack.configSchema.parse(configs[pack.id]) : configs[pack.id]
      const dispose = pack.register(host, config)
      if (dispose) host.cleanup.defer(dispose)
    }
  } }
}
