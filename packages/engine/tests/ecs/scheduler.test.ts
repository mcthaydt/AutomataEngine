import { describe, expect, it } from 'vitest'
import { Scheduler, FIXED_STAGES, type System } from '../../src/ecs/scheduler'

type Ctx = { log: string[] }
const system = (name: string, stage: System<Ctx>['stage']): System<Ctx> =>
  ({ name, stage, run: (ctx) => ctx.log.push(name) })

describe('Scheduler', () => {
  it('runFixed runs input -> update -> physics -> postPhysics, insertion order within a stage', () => {
    const scheduler = new Scheduler<Ctx>()
    scheduler.add(system('sync', 'postPhysics'))
    scheduler.add(system('tilt', 'update'))
    scheduler.add(system('step', 'physics'))
    scheduler.add(system('poll', 'input'))
    scheduler.add(system('platforms', 'update'))

    const ctx = { log: [] as string[] }
    scheduler.runFixed(ctx)
    expect(ctx.log).toEqual(['poll', 'tilt', 'platforms', 'step', 'sync'])
  })

  it('render stage only runs via runStage("render")', () => {
    const scheduler = new Scheduler<Ctx>()
    scheduler.add(system('draw', 'render'))
    scheduler.add(system('tilt', 'update'))

    const ctx = { log: [] as string[] }
    scheduler.runFixed(ctx)
    expect(ctx.log).toEqual(['tilt'])
    scheduler.runStage('render', ctx)
    expect(ctx.log).toEqual(['tilt', 'draw'])
  })

  it('rejects duplicate system names', () => {
    const scheduler = new Scheduler<Ctx>()
    scheduler.add(system('tilt', 'update'))
    expect(() => scheduler.add(system('tilt', 'input'))).toThrow(/tilt/)
  })

  it('exposes the fixed stage list for reference', () => {
    expect(FIXED_STAGES).toEqual(['input', 'update', 'physics', 'postPhysics'])
  })
})
