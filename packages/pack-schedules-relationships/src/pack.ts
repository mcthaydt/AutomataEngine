import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  CLOCK_SLICE_ID, QUEST_COMPLETED_EVENT, QUEST_LOG_SLICE_ID, RELATIONSHIPS_SLICE_ID,
  RELATIONSHIP_CHANGED_EVENT, SLOT_NAMES, TIME_SLOT_CHANGED_EVENT,
  packConfigSchema, type ClockSliceValue, type RelationshipsSliceValue,
  type SchedulesRelationshipsPackConfig
} from './config'
import { createClock, stepClock, type ClockState } from './clockCore'
import { initialWalkerPositions, stepWalker, walkerTarget, type WalkerPosition } from './scheduleCore'
import {
  applyQuestCompleted, createAffinities, deserializeSchedulesState, relationshipsComplete,
  serializeSchedulesState, tierOf, type Affinities
} from './relationshipCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const WALKER_COLOR = '#3ddc84'
const WALKER_RADIUS = 0.35

/** The third standard pack: ambient schedules plus quest-driven relationships. */
export const schedulesRelationshipsPack: GamePack<SchedulesRelationshipsPackConfig> = {
  id: 'schedules-relationships',
  version: '1.0.0',
  compatibility: packCompatibility({
    requires: ['dialogue-quests'],
    stateSlices: { owns: [CLOCK_SLICE_ID, RELATIONSHIPS_SLICE_ID], reads: [QUEST_LOG_SLICE_ID] },
    events: { emits: [TIME_SLOT_CHANGED_EVENT, RELATIONSHIP_CHANGED_EVENT], consumes: [QUEST_COMPLETED_EVENT] }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let clock: ClockState = createClock()
    let affinities: Affinities = createAffinities(config.relationships)
    let positions: Record<string, WalkerPosition> = initialWalkerPositions(config.walkers, clock.slot)

    const clockValue = (): ClockSliceValue => ({ slot: clock.slot, slotName: SLOT_NAMES[clock.slot]! })
    const relationshipsValue = (): RelationshipsSliceValue => ({ affinities: { ...affinities } })
    ctx.state.register(CLOCK_SLICE_ID, schedulesRelationshipsPack.id, clockValue())
    ctx.state.register(RELATIONSHIPS_SLICE_ID, schedulesRelationshipsPack.id, relationshipsValue())

    const entities = new Map(config.walkers.map((walker) => [walker.id, { id: `schedules-walker-${walker.id}` }]))
    for (const walker of config.walkers) {
      const entity = entities.get(walker.id)!
      ctx.render.add(entity, { primitive: 'sphere', radius: WALKER_RADIUS, color: WALKER_COLOR })
      ctx.host.cleanup.defer(() => ctx.render.remove(entity))
    }
    const renderWalkers = (): void => {
      for (const walker of config.walkers) {
        const position = positions[walker.id]!
        ctx.render.setPose(entities.get(walker.id)!, { x: position.x, y: WALKER_RADIUS, z: position.z }, IDENTITY)
      }
    }
    renderWalkers()

    const clockHud = document.createElement('div')
    clockHud.className = 'clock-hud'
    ctx.host.overlays.append(clockHud)
    const relationshipsHud = document.createElement('div')
    relationshipsHud.className = 'relationships-hud'
    ctx.host.overlays.append(relationshipsHud)
    const updateHuds = (): void => {
      clockHud.textContent = SLOT_NAMES[clock.slot]!
      relationshipsHud.textContent = config.relationships.tracked
        .map((entry) => `${entry.name}: ${tierOf(affinities[entry.npcId] ?? 0, config.relationships.thresholds)}`)
        .join(' · ')
    }
    updateHuds()

    const setClock = (next: ClockState): void => {
      clock = next
      ctx.state.set(CLOCK_SLICE_ID, schedulesRelationshipsPack.id, clockValue())
    }
    const setAffinities = (next: Affinities): void => {
      affinities = next
      ctx.state.set(RELATIONSHIPS_SLICE_ID, schedulesRelationshipsPack.id, relationshipsValue())
    }

    const offQuestCompleted = ctx.events.on(QUEST_COMPLETED_EVENT, (payload) => {
      const questId = (payload as { questId?: string } | undefined)?.questId
      if (!questId) return
      const next = applyQuestCompleted(affinities, questId, config.relationships)
      if (next === affinities) return
      setAffinities(next)
      ctx.events.emit(RELATIONSHIP_CHANGED_EVENT, { packId: schedulesRelationshipsPack.id, affinities: { ...next } })
      updateHuds()
    })

    return {
      fixedUpdate(dt) {
        const step = stepClock(clock, dt, config.slotSeconds)
        if (step.slotChanged) {
          setClock(step.state)
          ctx.events.emit(TIME_SLOT_CHANGED_EVENT, { packId: schedulesRelationshipsPack.id, ...clockValue() })
          updateHuds()
        } else {
          clock = step.state
        }
        for (const walker of config.walkers) {
          positions[walker.id] = stepWalker(positions[walker.id]!, walkerTarget(walker, clock.slot), walker.speed, dt)
        }
        renderWalkers()
      },
      objectivesComplete: () => relationshipsComplete(affinities, config.relationships),
      saveState: () => serializeSchedulesState(clock, affinities),
      loadState(raw) {
        const restored = deserializeSchedulesState(raw, config)
        setClock(restored.clock)
        setAffinities(restored.affinities)
        positions = initialWalkerPositions(config.walkers, clock.slot)
        renderWalkers()
        updateHuds()
      },
      dispose() {
        offQuestCompleted()
        clockHud.remove()
        relationshipsHud.remove()
      }
    }
  }
}
