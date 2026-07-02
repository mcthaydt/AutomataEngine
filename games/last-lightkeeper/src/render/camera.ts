import {
  decayCameraShake,
  sampleCameraShake,
  type OrthographicCameraDef
} from '@automata/engine'
import type { NightState } from '../state/night'

export interface LighthouseCamera {
  impulse(amplitude: number): void
  update(state: NightState, dt: number): OrthographicCameraDef
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createLighthouseCamera(seed: number): LighthouseCamera {
  let amplitude = 0
  let sample = 0

  return {
    impulse(nextAmplitude) {
      if (!Number.isFinite(nextAmplitude) || nextAmplitude < 0) {
        throw new Error('Camera impulse must be a non-negative finite number')
      }
      amplitude = Math.max(amplitude, clamp(nextAmplitude, 0, 4))
    },

    update(state, dt) {
      amplitude = decayCameraShake(amplitude, dt, 4)
      const shake = sampleCameraShake((seed + sample++) >>> 0, amplitude)
      const focusX = Math.abs(state.keeper.x) < 16
        ? 0
        : Math.round(clamp(state.keeper.x * 0.08, -8, 8))
      const keeperOffsetY = state.keeper.y - 135
      const focusY = Math.abs(keeperOffsetY) < 24
        ? 0
        : Math.round(clamp(keeperOffsetY * 0.04, -4, 4))
      return {
        x: focusX,
        y: 135 + focusY,
        viewportWidth: 480,
        viewportHeight: 270,
        zoom: 1,
        shakeX: shake.x,
        shakeY: shake.y,
        pixelSnap: 1
      }
    }
  }
}
