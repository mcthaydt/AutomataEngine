import { subscribeSelector } from '@automata/engine'
import type { GameStore } from '../state/root'

export interface Hud { element: HTMLElement; dispose(): void }

function formatTime(ms: number): string {
  const totalS = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(totalS / 60)}:${(totalS % 60).toString().padStart(2, '0')}`
}

/** Live HUD overlay: lives, bananas, remaining time, driven by the session slice. */
export function createHud(store: GameStore, timeLimitS: number): Hud {
  const element = document.createElement('div')
  element.className = 'hud'
  const lives = document.createElement('span'); lives.className = 'hud-lives'
  const bananas = document.createElement('span'); bananas.className = 'hud-bananas'
  const time = document.createElement('span'); time.className = 'hud-time'
  element.append(lives, bananas, time)

  const paint = (): void => {
    const s = store.getState().session
    lives.textContent = `Lives ${s.lives}`
    bananas.textContent = `Bananas ${s.bananas}`
    time.textContent = formatTime(timeLimitS * 1000 - s.elapsedMs)
  }
  paint()
  const unsubscribe = subscribeSelector(store, (st) => st.session, paint)
  return { element, dispose: unsubscribe }
}
