import type { System } from '@automata/engine'
import { spawnWave } from '../sim/spawn'
import { chooseUpgrades } from '../sim/upgrades'
import { emitFeedback } from './feedback'
import { isPlaying, type GameCtx } from '../game/context'

/**
 * Owns the wave lifecycle: deterministically spawns each wave, then on a clear
 * either offers upgrades (waves 1-4) or wins the run (boss on wave 5). Wave
 * spawning and upgrade offers share the run's seeded RNG.
 */
export function createDirector(): System<GameCtx> {
  let lastRunId = -1
  let spawnedWave = 0
  return {
    name: 'director',
    stage: 'update',
    run(ctx) {
      if (!isPlaying(ctx)) return
      const run = ctx.store.getState().run
      if (run.runId !== lastRunId) {
        lastRunId = run.runId
        spawnedWave = 0
      }
      if (spawnedWave !== run.wave) {
        spawnWave(ctx.world, run.wave, ctx.rng, ctx.config)
        spawnedWave = run.wave
        if (run.wave === ctx.config.waves.length) emitFeedback(ctx.feedback, 'bossSpawn')
        return
      }
      if ([...ctx.world.with('enemy')].length > 0) return
      if (run.wave < ctx.config.waves.length) {
        const upgradeIds = Object.keys(ctx.config.upgrades) as Array<keyof typeof ctx.config.upgrades>
        ctx.store.dispatch({ type: 'waveCleared', choices: chooseUpgrades(ctx.rng, upgradeIds) })
        emitFeedback(ctx.feedback, 'waveCleared')
      } else {
        ctx.store.dispatch({ type: 'bossDefeated' })
        emitFeedback(ctx.feedback, 'victory')
      }
    }
  }
}
