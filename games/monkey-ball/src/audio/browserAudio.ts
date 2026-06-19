import { createNullAudio, createWebAudio, type AudioPort } from '@automata/engine'

export interface BrowserAudio {
  audio: AudioPort
  resume(): void
}

export function createBrowserAudio(
  createContext: () => AudioContext = () => new AudioContext()
): BrowserAudio {
  try {
    const context = createContext()
    return {
      audio: createWebAudio(context),
      resume() { void context.resume() }
    }
  } catch {
    return {
      audio: createNullAudio().port,
      resume() {}
    }
  }
}
