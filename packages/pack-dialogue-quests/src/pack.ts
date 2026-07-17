import type { GamePack, PackRuntimeHandle } from '@automata/game-kit'
import { packCompatibility } from '@automata/game-kit'
import {
  DIALOGUE_ENDED_EVENT, INVENTORY_SLICE_ID, ITEM_ACQUIRED_EVENT, packConfigSchema,
  QUEST_COMPLETED_EVENT, QUEST_LOG_SLICE_ID,
  type DialogueEffect, type DialogueQuestsPackConfig, type NpcDef
} from './config'
import { availableChoices, choose, currentNode, startDialogue, type DialogueSession } from './dialogueCore'
import {
  acceptQuest, activeMainQuest, completeQuest, createQuestLog, deserializeQuestLog,
  questsComplete, serializeQuestLog, type InventoryView, type QuestLog
} from './questCore'

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }
const NPC_COLOR = '#7c5cff'
const EXIT_FACTOR = 1.5

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** The second standard pack: proximity dialogue plus a talk/fetch quest log. */
export const dialogueQuestsPack: GamePack<DialogueQuestsPackConfig> = {
  id: 'dialogue-quests',
  version: '1.0.0',
  compatibility: packCompatibility({
    requires: ['interaction-inventory'],
    stateSlices: { owns: [QUEST_LOG_SLICE_ID], reads: [INVENTORY_SLICE_ID] },
    events: { emits: [QUEST_COMPLETED_EVENT, DIALOGUE_ENDED_EVENT], consumes: [ITEM_ACQUIRED_EVENT] }
  }),
  configSchema: packConfigSchema,
  register(ctx, config): PackRuntimeHandle {
    let questLog: QuestLog = createQuestLog(config.quests)
    ctx.state.register(QUEST_LOG_SLICE_ID, dialogueQuestsPack.id, questLog)
    const inventory = (): InventoryView => ctx.state.get(INVENTORY_SLICE_ID) as InventoryView

    for (const npc of config.npcs) {
      const entity = { id: `dialogue-npc-${npc.id}` }
      ctx.render.add(entity, { primitive: 'sphere', radius: 0.5, color: NPC_COLOR })
      ctx.render.setPose(entity, { x: npc.position.x, y: 0.5, z: npc.position.z }, IDENTITY)
      ctx.host.cleanup.defer(() => ctx.render.remove(entity))
    }

    const hud = document.createElement('div')
    hud.className = 'quest-hud'
    ctx.host.overlays.append(hud)
    const updateHud = (): void => {
      const mains = config.quests.filter((quest) => quest.kind === 'main')
      const done = mains.filter((quest) => questLog[quest.id] === 'complete').length
      const focus = activeMainQuest(questLog, config.quests)
      hud.textContent = `${focus ? focus.title : 'All quests complete'} ${done}/${mains.length}`
    }
    updateHud()

    let engaged: { npc: NpcDef; session: DialogueSession } | null = null
    let cooldownNpcId: string | null = null
    let overlay: HTMLElement | null = null

    const closeOverlay = (emitEnded: boolean): void => {
      if (!overlay) return
      overlay.remove()
      overlay = null
      if (emitEnded && engaged) {
        ctx.events.emit(DIALOGUE_ENDED_EVENT, { packId: dialogueQuestsPack.id, npcId: engaged.npc.id })
      }
      engaged = null
    }

    const renderOverlay = (): void => {
      if (!engaged) return
      const dialogue = config.dialogues.find((entry) => entry.id === engaged!.npc.dialogueId)!
      overlay?.remove()
      overlay = document.createElement('div')
      overlay.className = 'dialogue-overlay'
      const text = document.createElement('p')
      text.className = 'dialogue-text'
      const node = currentNode(dialogue, engaged.session)
      text.textContent = `${node.speaker}: ${node.text}`
      overlay.append(text)
      const list = document.createElement('ol')
      for (const choice of availableChoices(dialogue, engaged.session, questLog, inventory())) {
        const item = document.createElement('li')
        item.textContent = choice.text
        list.append(item)
      }
      overlay.append(list)
      ctx.host.overlays.append(overlay)
    }

    const setQuestLog = (next: QuestLog): void => {
      questLog = next
      ctx.state.set(QUEST_LOG_SLICE_ID, dialogueQuestsPack.id, questLog)
      updateHud()
    }

    const applyEffects = (effects: readonly DialogueEffect[]): void => {
      for (const effect of effects) {
        const before = questLog
        setQuestLog(effect.kind === 'acceptQuest'
          ? acceptQuest(questLog, effect.questId)
          : completeQuest(questLog, effect.questId, config.quests, inventory()))
        if (effect.kind === 'completeQuest' && questLog !== before) {
          ctx.events.emit(QUEST_COMPLETED_EVENT, { packId: dialogueQuestsPack.id, questId: effect.questId })
        }
      }
    }

    const onKeydown = (event: KeyboardEvent): void => {
      if (!engaged) return
      const index = Number.parseInt(event.key, 10) - 1
      if (Number.isNaN(index) || index < 0 || index > 8) return
      const dialogue = config.dialogues.find((entry) => entry.id === engaged!.npc.dialogueId)!
      const outcome = choose(dialogue, engaged.session, index, questLog, inventory())
      applyEffects(outcome.effects)
      if (outcome.session === null) {
        cooldownNpcId = engaged.npc.id
        closeOverlay(true)
      } else if (outcome.session !== engaged.session) {
        engaged = { npc: engaged.npc, session: outcome.session }
        renderOverlay()
      }
    }
    window.addEventListener('keydown', onKeydown)
    const offItemAcquired = ctx.events.on(ITEM_ACQUIRED_EVENT, () => { if (engaged) renderOverlay() })

    return {
      fixedUpdate(_dt, world) {
        const player = world.playerPosition
        if (engaged) {
          // Overlay content changes on engage, choice, and itemAcquired—not on every simulation tick.
          if (distance(player, engaged.npc.position) > config.talkRadius * EXIT_FACTOR) closeOverlay(true)
          return
        }
        if (cooldownNpcId) {
          const cooldownNpc = config.npcs.find((npc) => npc.id === cooldownNpcId)!
          if (distance(player, cooldownNpc.position) > config.talkRadius * EXIT_FACTOR) cooldownNpcId = null
        }
        const nearest = config.npcs
          .filter((npc) => npc.id !== cooldownNpcId && distance(player, npc.position) <= config.talkRadius)
          .sort((a, b) => distance(player, a.position) - distance(player, b.position) || a.id.localeCompare(b.id))[0]
        if (nearest) {
          const dialogue = config.dialogues.find((entry) => entry.id === nearest.dialogueId)!
          engaged = { npc: nearest, session: startDialogue(dialogue) }
          renderOverlay()
        }
      },
      objectivesComplete: () => questsComplete(questLog, config.quests),
      saveState: () => serializeQuestLog(questLog),
      loadState(raw) {
        const restored = deserializeQuestLog(raw, config.quests)
        closeOverlay(false)
        cooldownNpcId = null
        setQuestLog(restored)
      },
      dispose() {
        window.removeEventListener('keydown', onKeydown)
        offItemAcquired()
        closeOverlay(false)
        hud.remove()
      }
    }
  }
}
