import type { View } from '@automata/game-kit'

import { NIGHT_DURATION_S, nightDefinition } from '../data/night'
import type { CircuitId } from '../data/schema'
import type { GameStore } from '../state/root'

function field(className: string): HTMLDivElement {
  const element = document.createElement('div')
  element.className = className
  return element
}

function percent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)))
}

function formatRemaining(timeS: number): string {
  const remaining = Math.max(0, Math.ceil(NIGHT_DURATION_S - timeS))
  const minutes = Math.floor(remaining / 60)
  return `${minutes}:${String(remaining % 60).padStart(2, '0')}`
}

export function createHud(store: GameStore): View {
  const element = document.createElement('div')
  element.className = 'hud'

  const time = field('hud-time')
  const rescues = field('hud-rescues')
  const integrity = field('hud-integrity')
  const flood = field('hud-flood')
  const generator = field('hud-generator')
  const beacon = field('hud-beacon')
  const call = field('hud-call')
  const carried = field('hud-carried')
  const circuitList = field('hud-circuits')
  const prompt = field('hud-prompt')

  const circuitNodes = new Map<CircuitId, HTMLDivElement>()
  for (const id of nightDefinition.circuits) {
    const node = field('hud-circuit')
    node.dataset.circuit = id
    circuitNodes.set(id, node)
    circuitList.append(node)
  }

  element.append(
    time,
    rescues,
    integrity,
    flood,
    generator,
    beacon,
    call,
    carried,
    circuitList,
    prompt
  )

  const paint = (): void => {
    const { night } = store.getState()
    time.textContent = `◷ DAWN ${formatRemaining(night.timeS)}`
    rescues.textContent = `⚓ RESCUES ${night.rescues}/${nightDefinition.rules.rescueTarget}`
    integrity.textContent = `◆ INTEGRITY ${percent(night.integrity)}%`
    integrity.classList.toggle('is-warning', night.integrity <= 35)
    flood.textContent = `≋ FLOOD ${percent(night.flooding)}%`
    flood.classList.toggle('is-warning', night.flooding >= 75)
    generator.textContent = `♨ HEAT ${percent(night.generator.heat * 100)}% · CAPACITY ${night.generator.capacity}`
    generator.classList.toggle('is-warning', night.generator.heat >= 0.9)
    beacon.textContent = `☀ BEACON ${Math.round(night.beaconBearingDeg)}° · LOCK ${night.beaconLockS.toFixed(1)}s`

    const activeCall = night.activeCallId === null
      ? null
      : nightDefinition.calls.find((definition) => definition.id === night.activeCallId)
    const callState = night.activeCallId === null ? null : night.calls[night.activeCallId]
    call.textContent = activeCall && callState
      ? `☎ ${activeCall.shipName} · ${callState.status}`
      : '☎ NO ACTIVE CALL'

    const carriedItem = night.keeper.carriedItem === null
      ? null
      : nightDefinition.items.find((item) => item.id === night.keeper.carriedItem)
    carried.textContent = `▣ CARRIED ${carriedItem?.label ?? 'NONE'}`

    for (const id of nightDefinition.circuits) {
      const state = night.circuits[id]
      const node = circuitNodes.get(id)!
      node.className = 'hud-circuit'
      node.classList.toggle('is-requested', state.requested)
      node.classList.toggle('is-powered', state.powered)
      node.classList.toggle('is-unpowered', state.requested && !state.powered)
      node.classList.toggle('is-tripped', state.tripped)
      const requested = state.requested ? '● REQUESTED' : '○ OFF'
      const powered = state.tripped ? '⚠ TRIPPED' : state.powered ? '✓ POWERED' : '× UNPOWERED'
      node.textContent = `${id.toUpperCase()} ${requested} ${powered}`
    }

    prompt.textContent = night.focus?.prompt ?? '—'
    prompt.classList.toggle('is-active', night.focus !== null)
  }

  paint()
  const unsubscribe = store.subscribe(paint)
  let disposed = false
  return {
    element,
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      element.remove()
    }
  }
}
