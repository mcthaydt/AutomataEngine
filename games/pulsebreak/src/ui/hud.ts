import type { View } from '@automata/game-kit'
import type { GameStore } from '../state/root'

/** Live gameplay HUD: integrity bar, score, wave, and best score. */
export function createHud(store: GameStore, waveCount: number): View {
  const element = document.createElement('div')
  element.className = 'hud'

  const health = document.createElement('div')
  health.className = 'hud-health'
  const fill = document.createElement('div')
  fill.className = 'hud-health-fill'
  health.append(fill)

  const score = document.createElement('span'); score.className = 'hud-score'
  const wave = document.createElement('span'); wave.className = 'hud-wave'
  const best = document.createElement('span'); best.className = 'hud-best'
  element.append(health, wave, score, best)

  const paint = (): void => {
    const { run, progress } = store.getState()
    fill.style.width = `${(run.health / run.maxHealth) * 100}%`
    score.textContent = `SCORE ${run.score}`
    wave.textContent = `WAVE ${run.wave}/${waveCount}`
    best.textContent = `BEST ${progress.bestScore}`
  }
  paint()
  const unsubscribe = store.subscribe(paint)

  return {
    element,
    dispose() {
      unsubscribe()
      element.remove()
    }
  }
}
