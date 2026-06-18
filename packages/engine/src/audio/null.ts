import type { AudioPort, SoundSpec } from './port'

export interface AudioCall {
  op: 'register' | 'play' | 'setMasterVolume'
  id?: string
  spec?: SoundSpec
  volume?: number
}

export interface NullAudio {
  port: AudioPort
  calls: AudioCall[]
}

/** Recording AudioPort double for tests; never touches WebAudio. */
export function createNullAudio(): NullAudio {
  const calls: AudioCall[] = []
  const registered = new Set<string>()
  const port: AudioPort = {
    register(id, spec) {
      registered.add(id)
      calls.push({ op: 'register', id, spec })
    },
    play(id) {
      if (registered.has(id)) calls.push({ op: 'play', id })
    },
    setMasterVolume(volume) {
      calls.push({ op: 'setMasterVolume', volume })
    }
  }
  return { port, calls }
}
