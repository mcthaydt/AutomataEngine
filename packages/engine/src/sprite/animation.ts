import type { AnimationState, SpriteAnimation } from './types'

export type { AnimationState, SpriteAnimation, SpriteFrame } from './types'

export interface AnimationAdvance {
  state: AnimationState
  events: string[]
}

function assertAnimation(animation: SpriteAnimation): void {
  if (animation.frames.length === 0) throw new Error('Sprite animation requires at least one frame')
  for (const frame of animation.frames) {
    if (!Number.isFinite(frame.durationS) || frame.durationS <= 0) {
      throw new Error('Sprite frame duration must be a positive finite number')
    }
  }
}

export function createAnimationState(animation: SpriteAnimation): AnimationState {
  assertAnimation(animation)
  return { animation: animation.name, frame: 0, elapsedS: 0, complete: false }
}

export function advanceAnimation(
  animation: SpriteAnimation,
  state: AnimationState,
  dt: number
): AnimationAdvance {
  assertAnimation(animation)
  if (!Number.isFinite(dt) || dt < 0) throw new Error('Animation time must be a non-negative finite number')
  if (state.animation !== animation.name) throw new Error('Animation state does not match definition')
  if (state.frame < 0 || state.frame >= animation.frames.length) throw new Error('Animation frame is out of range')
  if (state.complete && !animation.loop) return { state, events: [] }

  let frame = state.frame
  let elapsedS = state.elapsedS + dt
  const events: string[] = []

  while (elapsedS >= animation.frames[frame]!.durationS) {
    elapsedS -= animation.frames[frame]!.durationS
    if (frame === animation.frames.length - 1) {
      if (!animation.loop) {
        return {
          state: {
            animation: animation.name,
            frame,
            elapsedS: animation.frames[frame]!.durationS,
            complete: true
          },
          events
        }
      }
      frame = 0
    } else {
      frame++
    }
    const event = animation.frames[frame]!.event
    if (event !== undefined) events.push(event)
  }

  return {
    state: { animation: animation.name, frame, elapsedS, complete: false },
    events
  }
}
