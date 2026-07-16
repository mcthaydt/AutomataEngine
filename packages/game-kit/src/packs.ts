import type { RenderPort } from '@automata/engine'
import type { GameHost } from './host'
import { createPackEventBus, type PackEventBus } from './packEvents'
import { createPackStateRegistry, type PackStateRegistry } from './packState'

/**
 * The capability-pack interface v2 (factory Phase 4). Packs register against a
 * boot context and hand back a runtime handle; the composed runtime is driven
 * by the game loop. Player state flows IN as an argument, win-gating flows OUT
 * via objectivesComplete. v2 adds the shared seam: compatibility declarations
 * validated at compose time, named state slices (sole-writer), a typed event
 * bus, and an optional persistence slot the save/load pack later orchestrates.
 */
export interface PackCompatibility {
  requires: readonly string[]
  conflictsWith: readonly string[]
  integratesWith: readonly string[]
  stateSlices: { owns: readonly string[]; reads: readonly string[] }
  events: { emits: readonly string[]; consumes: readonly string[] }
}

/** Fill an empty declaration; packs override only what they use. */
export function packCompatibility(partial: Partial<PackCompatibility> = {}): PackCompatibility {
  return {
    requires: partial.requires ?? [],
    conflictsWith: partial.conflictsWith ?? [],
    integratesWith: partial.integratesWith ?? [],
    stateSlices: { owns: partial.stateSlices?.owns ?? [], reads: partial.stateSlices?.reads ?? [] },
    events: { emits: partial.events?.emits ?? [], consumes: partial.events?.consumes ?? [] }
  }
}

/** What games hand to boot — unchanged from v1, so main.ts templates stay put. */
export interface PackBootBase {
  host: GameHost
  render: RenderPort
}

export interface PackBootContext extends PackBootBase {
  events: PackEventBus
  state: PackStateRegistry
}

export interface PackWorldState {
  playerPosition: { x: number; z: number }
}

export interface PackRuntimeHandle {
  fixedUpdate?(dt: number, world: PackWorldState): void
  render?(alpha: number): void
  /** Win-condition gate; the composed runtime ANDs all gates (vacuously true). */
  objectivesComplete?(): boolean
  /** Persistence slot over the pack's owned slices (contract v2, pinned now). */
  saveState?(): unknown
  loadState?(state: unknown): void
  dispose?(): void
}

export interface GamePack<TConfig = unknown> {
  id: string
  version: string
  compatibility: PackCompatibility
  /** Structural schema slot (zod-compatible); validated at boot when present. */
  configSchema?: { parse(input: unknown): TConfig }
  register(ctx: PackBootContext, config: TConfig): PackRuntimeHandle | void
}

export interface PackSetIssue {
  severity: 'error' | 'warning'
  code: 'pack-duplicate-id' | 'pack-missing-requirement' | 'pack-conflict'
    | 'pack-duplicate-slice-owner' | 'pack-event-unproduced'
  packId: string
  message: string
}

/** Compose-time validation of a selected pack set's compatibility graph. */
export function validatePackSet(packs: readonly GamePack[]): PackSetIssue[] {
  const issues: PackSetIssue[] = []
  const ids = new Set<string>()
  for (const pack of packs) {
    if (ids.has(pack.id)) {
      issues.push({ severity: 'error', code: 'pack-duplicate-id', packId: pack.id, message: `Duplicate pack id "${pack.id}"` })
    }
    ids.add(pack.id)
  }
  const sliceOwners = new Map<string, string>()
  const emitted = new Set(packs.flatMap((pack) => [...pack.compatibility.events.emits]))
  for (const pack of packs) {
    for (const required of pack.compatibility.requires) {
      if (!ids.has(required)) {
        issues.push({ severity: 'error', code: 'pack-missing-requirement', packId: pack.id, message: `Pack "${pack.id}" requires missing pack "${required}"` })
      }
    }
    for (const conflict of pack.compatibility.conflictsWith) {
      if (ids.has(conflict)) {
        issues.push({ severity: 'error', code: 'pack-conflict', packId: pack.id, message: `Pack "${pack.id}" conflicts with selected pack "${conflict}"` })
      }
    }
    for (const slice of pack.compatibility.stateSlices.owns) {
      const owner = sliceOwners.get(slice)
      if (owner) {
        issues.push({ severity: 'error', code: 'pack-duplicate-slice-owner', packId: pack.id, message: `Slice "${slice}" owned by both "${owner}" and "${pack.id}"` })
      } else {
        sliceOwners.set(slice, pack.id)
      }
    }
    for (const consumed of pack.compatibility.events.consumes) {
      if (!emitted.has(consumed)) {
        issues.push({ severity: 'warning', code: 'pack-event-unproduced', packId: pack.id, message: `Pack "${pack.id}" consumes event "${consumed}" that no selected pack emits` })
      }
    }
  }
  return issues
}

export class PackCompositionError extends Error {
  constructor(readonly issues: PackSetIssue[]) {
    super(`Pack set invalid: ${issues.map((issue) => issue.message).join('; ')}`)
    this.name = 'PackCompositionError'
  }
}

export interface ComposedRuntime {
  packIds: readonly string[]
  fixedUpdate(dt: number, world: PackWorldState): void
  render(alpha: number): void
  objectivesComplete(): boolean
  /** Saved state per pack id, from packs implementing the persistence slot. */
  saveState(): Record<string, unknown>
  loadState(saved: Record<string, unknown>): void
}

export interface ComposedPacks {
  packIds: readonly string[]
  boot(base: PackBootBase): ComposedRuntime
}

export function composePacks(packs: readonly GamePack[], configs: Record<string, unknown> = {}): ComposedPacks {
  const errors = validatePackSet(packs).filter((issue) => issue.severity === 'error')
  if (errors.length > 0) throw new PackCompositionError(errors)
  const packIds = packs.map((pack) => pack.id)
  return {
    packIds,
    boot(base) {
      const ctx: PackBootContext = { ...base, events: createPackEventBus(), state: createPackStateRegistry() }
      const handles: Array<{ id: string; handle: PackRuntimeHandle }> = []
      for (const pack of packs) {
        const config = pack.configSchema ? pack.configSchema.parse(configs[pack.id]) : configs[pack.id]
        const handle = pack.register(ctx, config as never)
        if (!handle) continue
        handles.push({ id: pack.id, handle })
        if (handle.dispose) ctx.host.cleanup.defer(() => handle.dispose!())
      }
      return {
        packIds,
        fixedUpdate(dt, world) { for (const { handle } of handles) handle.fixedUpdate?.(dt, world) },
        render(alpha) { for (const { handle } of handles) handle.render?.(alpha) },
        objectivesComplete() { return handles.every(({ handle }) => handle.objectivesComplete?.() ?? true) },
        saveState() {
          const saved: Record<string, unknown> = {}
          for (const { id, handle } of handles) { if (handle.saveState) saved[id] = handle.saveState() }
          return saved
        },
        loadState(saved) {
          for (const { id, handle } of handles) {
            if (handle.loadState && id in saved) handle.loadState(saved[id])
          }
        }
      }
    }
  }
}
