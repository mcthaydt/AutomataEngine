import { createNullAudio, createWebAudio, type AudioPort } from '@automata/engine'

export interface BrowserAudio {
  audio: AudioPort
  resume(): void
  dispose(): void
}

export function createBrowserAudio(
  createContext: () => AudioContext = () => new AudioContext()
): BrowserAudio {
  try {
    const context = createContext()
    let disposed = false
    return {
      audio: createWebAudio(context),
      resume() { void context.resume() },
      dispose() {
        if (disposed) return
        disposed = true
        void context.close()
      }
    }
  } catch {
    return {
      audio: createNullAudio().port,
      resume() {},
      dispose() {}
    }
  }
}
