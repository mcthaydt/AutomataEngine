import { describe, expect, it } from 'vitest'
import { nightDefinition } from '../../src/data/night'
import { createStormParticles, deriveEffects, waterHeight } from '../../src/render/effects'
import { activateFailure } from '../../src/sim/failures'
import { createInitialNight } from '../../src/state/night'

describe('storm effects', () => {
  it('creates deterministic bounded rain, spray, and spark particles', () => {
    const one = createStormParticles(42, { rain: 12, spray: 5, sparks: 4 })
    expect(createStormParticles(42, { rain: 12, spray: 5, sparks: 4 })).toEqual(one)
    expect(createStormParticles(43, { rain: 12, spray: 5, sparks: 4 })).not.toEqual(one)
    for (const particle of [...one.rain, ...one.spray, ...one.sparks]) {
      expect(particle.x).toBeGreaterThanOrEqual(-240)
      expect(particle.x).toBeLessThanOrEqual(240)
      expect(particle.y).toBeGreaterThanOrEqual(0)
      expect(particle.y).toBeLessThanOrEqual(270)
    }
  })

  it('maps flooding to a clamped water visualization height', () => {
    expect(waterHeight(-1)).toBe(0)
    expect(waterHeight(50)).toBe(24)
    expect(waterHeight(100)).toBe(48)
    expect(waterHeight(200)).toBe(48)
  })

  it('derives lightning flash, spray, sparks, and bounded shake from failures', () => {
    let state = createInitialNight(1, 42)
    state = activateFailure(state, 'lightning-damage', 1, nightDefinition)
    state.flooding = 75
    state.generator.damage = 0.8
    const effects = deriveEffects(state)

    expect(effects.lightningFlashAlpha).toBeGreaterThan(0)
    expect(effects.sprayIntensity).toBe(0.75)
    expect(effects.sparksVisible).toBe(true)
    expect(Math.abs(effects.shakeX)).toBeLessThanOrEqual(4)
    expect(Math.abs(effects.shakeY)).toBeLessThanOrEqual(4)
  })

  it('shows beacon guidance and a unique recent rescue flare', () => {
    const state = createInitialNight(1, 42)
    state.timeS = 100
    state.activeCallId = 'mercy-bell'
    state.calls['mercy-bell'] = { ...state.calls['mercy-bell']!, status: 'guiding' }
    state.beaconBearingDeg = 30
    state.feedback.push({ type: 'ship-rescued', timeS: 99.5 })
    const effects = deriveEffects(state)

    expect(effects.beaconGlowAlpha).toBeGreaterThan(0)
    expect(effects.beaconCone).toMatchObject({ visible: true })
    expect(effects.beaconCone.rotationRad).toBeCloseTo(Math.PI / 6)
    expect(effects.rescueFlareVisible).toBe(true)
  })
})
