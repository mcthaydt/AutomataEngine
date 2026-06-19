import type { AudioPort, SoundSpec } from '@automata/engine'

export const SOUNDS: Record<string, SoundSpec> = {
  pickup: { freq: 880, durationS: 0.12, type: 'triangle', gain: 0.4 },
  bumper: { freq: 220, durationS: 0.15, type: 'square', gain: 0.4 },
  goal: { freq: 660, durationS: 0.4, type: 'sine', gain: 0.5 },
  fall: { freq: 140, durationS: 0.3, type: 'sawtooth', gain: 0.4 },
  uiClick: { freq: 520, durationS: 0.05, type: 'sine', gain: 0.3 }
}

export function registerSounds(audio: AudioPort): void {
  for (const [id, spec] of Object.entries(SOUNDS)) audio.register(id, spec)
}
