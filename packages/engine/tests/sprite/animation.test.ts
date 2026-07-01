import { describe, expect, it } from 'vitest'
import {
  advanceAnimation,
  createAnimationState,
  type SpriteAnimation
} from '../../src/sprite/animation'

const loop: SpriteAnimation = {
  name: 'run',
  loop: true,
  frames: [
    { textureId: 'keeper', source: { x: 0, y: 0, width: 16, height: 24 }, durationS: 0.1 },
    { textureId: 'keeper', source: { x: 16, y: 0, width: 16, height: 24 }, durationS: 0.2, event: 'step' },
    { textureId: 'keeper', source: { x: 32, y: 0, width: 16, height: 24 }, durationS: 0.1 }
  ]
}

describe('sprite animation timing', () => {
  it('starts on the first frame', () => {
    expect(createAnimationState(loop)).toEqual({
      animation: 'run', frame: 0, elapsedS: 0, complete: false
    })
  })

  it('advances across frames and emits events when entering them', () => {
    const result = advanceAnimation(loop, createAnimationState(loop), 0.15)
    expect(result.state).toMatchObject({ animation: 'run', frame: 1, complete: false })
    expect(result.state.elapsedS).toBeCloseTo(0.05)
    expect(result.events).toEqual(['step'])
  })

  it('loops through large time steps without losing frame events', () => {
    const result = advanceAnimation(loop, createAnimationState(loop), 0.75)
    expect(result.state.frame).toBe(2)
    expect(result.state.elapsedS).toBeCloseTo(0.05)
    expect(result.events).toEqual(['step', 'step'])
  })

  it('pins a non-looping animation to its final completed frame', () => {
    const once: SpriteAnimation = { ...loop, name: 'repair', loop: false }
    const result = advanceAnimation(once, createAnimationState(once), 2)
    expect(result.state).toEqual({
      animation: 'repair', frame: 2, elapsedS: 0.1, complete: true
    })
    expect(result.events).toEqual(['step'])
  })

  it('leaves completed non-looping animation state unchanged', () => {
    const once: SpriteAnimation = { ...loop, name: 'repair', loop: false }
    const complete = advanceAnimation(once, createAnimationState(once), 2).state
    expect(advanceAnimation(once, complete, 1)).toEqual({ state: complete, events: [] })
  })

  it('rejects invalid definitions and elapsed time', () => {
    expect(() => createAnimationState({ name: 'empty', loop: true, frames: [] })).toThrow(/frame/i)
    expect(() => createAnimationState({
      name: 'bad', loop: true, frames: [{ ...loop.frames[0]!, durationS: 0 }]
    })).toThrow(/duration/i)
    expect(() => advanceAnimation(loop, createAnimationState(loop), -0.01)).toThrow(/time/i)
    expect(() => advanceAnimation(loop, createAnimationState(loop), Number.NaN)).toThrow(/time/i)
    expect(() => advanceAnimation(loop, { ...createAnimationState(loop), animation: 'idle' }, 0)).toThrow(/match/i)
    expect(() => advanceAnimation(loop, { ...createAnimationState(loop), frame: -1 }, 0)).toThrow(/range/i)
    expect(() => advanceAnimation(loop, { ...createAnimationState(loop), frame: 99 }, 0)).toThrow(/range/i)
  })
})
