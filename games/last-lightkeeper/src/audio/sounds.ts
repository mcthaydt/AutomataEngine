import type { AudioPort, SoundSpec } from '@automata/engine'

export const SOUNDS: Record<string, SoundSpec> = {
  storm: { freq: 72, durationS: 0.55, type: 'sawtooth', gain: 0.18 },
  machinery: { freq: 110, durationS: 0.18, type: 'square', gain: 0.2 },
  radio: { freq: 460, durationS: 0.12, type: 'square', gain: 0.22 },
  alarm: { freq: 760, durationS: 0.28, type: 'sawtooth', gain: 0.34 },
  repair: { freq: 320, durationS: 0.1, type: 'triangle', gain: 0.2 },
  beacon: { freq: 620, durationS: 0.16, type: 'sine', gain: 0.24 },
  rescue: { freq: 880, durationS: 0.5, type: 'triangle', gain: 0.4 },
  failure: { freq: 95, durationS: 0.65, type: 'sawtooth', gain: 0.42 },
  dawn: { freq: 540, durationS: 0.75, type: 'sine', gain: 0.35 },
  ui: { freq: 580, durationS: 0.05, type: 'sine', gain: 0.2 }
}

export function registerSounds(audio: AudioPort): void {
  for (const [id, sound] of Object.entries(SOUNDS)) audio.register(id, sound)
}
