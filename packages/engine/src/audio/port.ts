/** A short synthesized beep: oscillator + linear gain envelope. */
export interface SoundSpec {
  freq: number
  durationS: number
  type: 'sine' | 'square' | 'triangle' | 'sawtooth'
  /** Peak gain in [0, 1]. */
  gain: number
}

export interface AudioPort {
  register(id: string, spec: SoundSpec): void
  play(id: string): void
  setMasterVolume(volume: number): void
}
