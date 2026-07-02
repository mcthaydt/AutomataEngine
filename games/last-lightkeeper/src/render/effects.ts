import type { NightState } from '../state/night'
import { createRng } from '../sim/rng'

export interface EffectParticle { x: number; y: number; speed: number; phase: number }
export interface StormParticles {
  rain: EffectParticle[]
  spray: EffectParticle[]
  sparks: EffectParticle[]
}
export interface ParticleCounts { rain: number; spray: number; sparks: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createStormParticles(seed: number, counts: ParticleCounts): StormParticles {
  const rng = createRng(seed)
  const create = (count: number, speedMin: number, speedMax: number): EffectParticle[] =>
    Array.from({ length: count }, () => ({
      x: rng.next() * 480 - 240,
      y: rng.next() * 270,
      speed: speedMin + rng.next() * (speedMax - speedMin),
      phase: rng.next()
    }))
  return {
    rain: create(counts.rain, 90, 150),
    spray: create(counts.spray, 20, 55),
    sparks: create(counts.sparks, 30, 80)
  }
}

export function waterHeight(flooding: number): number {
  return clamp(flooding, 0, 100) / 100 * 48
}

export interface EffectPresentation {
  lightningFlashAlpha: number
  sprayIntensity: number
  sparksVisible: boolean
  shakeX: number
  shakeY: number
  beaconGlowAlpha: number
  beaconCone: { visible: boolean; rotationRad: number }
  rescueFlareVisible: boolean
}

export function deriveEffects(state: NightState): EffectPresentation {
  const lightning = state.activeFailures['lightning-damage']
  const lightningAge = lightning === undefined ? Number.POSITIVE_INFINITY : state.timeS - lightning.activatedAtS
  const lightningFlashAlpha = clamp(1 - lightningAge / 0.35, 0, 1)
  const rescueFlareVisible = state.feedback.some((event) =>
    event.type === 'ship-rescued' && state.timeS >= event.timeS && state.timeS - event.timeS <= 1
  )
  const amplitude = clamp(
    lightningFlashAlpha * 4 + (rescueFlareVisible ? 1.5 : 0) + state.generator.damage * 1.5,
    0,
    4
  )
  const shakeRng = createRng((state.seed ^ Math.floor(state.timeS * 60)) >>> 0)
  const beaconDisabled = state.activeFailures['beacon-misalignment'] !== undefined ||
    state.activeFailures['lightning-damage'] !== undefined
  const guiding = state.activeCallId !== null && state.calls[state.activeCallId]?.status === 'guiding'

  return {
    lightningFlashAlpha,
    sprayIntensity: clamp(state.flooding / 100, 0, 1),
    sparksVisible: state.generator.damage >= 0.5 ||
      state.activeFailures['generator-damage'] !== undefined ||
      state.activeFailures.overheating !== undefined,
    shakeX: (shakeRng.next() * 2 - 1) * amplitude,
    shakeY: (shakeRng.next() * 2 - 1) * amplitude,
    beaconGlowAlpha: state.circuits.beacon.powered && !beaconDisabled ? 0.85 : 0,
    beaconCone: {
      visible: state.circuits.beacon.powered && !beaconDisabled && guiding,
      rotationRad: state.beaconBearingDeg * Math.PI / 180
    },
    rescueFlareVisible
  }
}
