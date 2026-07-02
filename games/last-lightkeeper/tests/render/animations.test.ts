import { advanceAnimation, createAnimationState } from '@automata/engine'
import { describe, expect, it } from 'vitest'
import manifest from '../../assets/manifest.json'
import {
  createKeeperAnimations,
  createOneShotEffectAnimation,
  keeperAnimationForMode,
  shipFrame,
  stationFrame
} from '../../src/render/animations'

describe('presentation animations', () => {
  it('maps every keeper mode to complete PixelLab frame groups', () => {
    const animations = createKeeperAnimations(manifest)
    expect(animations.idle.frames).toHaveLength(5)
    expect(animations.run.frames).toHaveLength(7)
    expect(animations.climb.frames).toHaveLength(5)
    expect(animations.carry.frames).toHaveLength(5)
    expect(animations['operate-repair'].frames).toHaveLength(7)
    expect(keeperAnimationForMode('idle')).toBe('idle')
    expect(keeperAnimationForMode('run')).toBe('run')
    expect(keeperAnimationForMode('climb')).toBe('climb')
    expect(keeperAnimationForMode('carry')).toBe('carry')
    expect(keeperAnimationForMode('operate')).toBe('operate-repair')
  })

  it('selects powered or damaged machinery frames deterministically', () => {
    expect(stationFrame('beacon', false)).toEqual({ x: 0, y: 0, width: 64, height: 64 })
    expect(stationFrame('beacon', true)).toEqual({ x: 64, y: 0, width: 64, height: 64 })
    expect(stationFrame('pump', false)).toEqual({ x: 0, y: 192, width: 64, height: 64 })
    expect(stationFrame('pump', true)).toEqual({ x: 64, y: 192, width: 64, height: 64 })
  })

  it('maps all rescue ship silhouettes to separate source rows', () => {
    expect(shipFrame('cutter').y).toBe(0)
    expect(shipFrame('trawler').y).toBe(85)
    expect(shipFrame('steamer').y).toBe(170)
  })

  it('completes one-shot effects through engine animation timing', () => {
    const effect = createOneShotEffectAnimation(manifest, 'rescue')
    const initial = createAnimationState(effect)
    const advanced = advanceAnimation(effect, initial, 10)
    expect(effect.loop).toBe(false)
    expect(effect.frames.length).toBeGreaterThan(1)
    expect(advanced.state.complete).toBe(true)
  })
})
