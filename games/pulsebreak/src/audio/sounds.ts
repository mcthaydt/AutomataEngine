import type { AudioPort, SoundSpec } from '@automata/engine'

/** Synthesized neon SFX: short oscillator beeps, no external assets. */
export const SOUNDS: Record<string, SoundSpec> = {
  shoot: { freq: 720, durationS: 0.06, type: 'square', gain: 0.18 },
  enemyShoot: { freq: 300, durationS: 0.08, type: 'sawtooth', gain: 0.16 },
  hit: { freq: 480, durationS: 0.05, type: 'triangle', gain: 0.22 },
  kill: { freq: 180, durationS: 0.22, type: 'sawtooth', gain: 0.35 },
  hurt: { freq: 120, durationS: 0.25, type: 'square', gain: 0.4 },
  wave: { freq: 540, durationS: 0.25, type: 'sine', gain: 0.35 },
  boss: { freq: 90, durationS: 0.6, type: 'sawtooth', gain: 0.45 },
  win: { freq: 760, durationS: 0.5, type: 'triangle', gain: 0.45 },
  lose: { freq: 110, durationS: 0.6, type: 'sine', gain: 0.4 },
  uiClick: { freq: 600, durationS: 0.05, type: 'sine', gain: 0.25 }
}

export function registerSounds(audio: AudioPort): void {
  for (const [id, spec] of Object.entries(SOUNDS)) audio.register(id, spec)
}
