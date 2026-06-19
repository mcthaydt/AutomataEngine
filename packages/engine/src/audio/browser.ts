import type { AudioPort, SoundSpec } from './port'

/** WebAudio adapter: synthesized beeps. Untested shim, keep trivially thin. */
export function createWebAudio(context: AudioContext = new AudioContext()): AudioPort {
  const specs = new Map<string, SoundSpec>()
  const master = context.createGain()
  master.connect(context.destination)
  return {
    register(id, spec) {
      specs.set(id, spec)
    },
    play(id) {
      const spec = specs.get(id)
      if (!spec) return
      void context.resume()
      const osc = context.createOscillator()
      const env = context.createGain()
      osc.type = spec.type
      osc.frequency.value = spec.freq
      const now = context.currentTime
      env.gain.setValueAtTime(0, now)
      env.gain.linearRampToValueAtTime(spec.gain, now + 0.01)
      env.gain.linearRampToValueAtTime(0, now + spec.durationS)
      osc.connect(env)
      env.connect(master)
      osc.start(now)
      osc.stop(now + spec.durationS)
    },
    setMasterVolume(volume) {
      master.gain.value = volume
    }
  }
}
