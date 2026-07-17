import { describe, expect, it, vi } from 'vitest'
import { createCleanupStack } from '@automata/engine'
import { mountBrowserAudio } from '../src/mountBrowserAudio'
import type { BrowserAudio } from '../src/browserAudio'

function fakeAudio(): BrowserAudio & { plays: string[] } {
  const plays: string[] = []
  return {
    plays,
    audio: { play: (id: string) => plays.push(id) } as unknown as BrowserAudio['audio'],
    resume: vi.fn(),
    dispose: vi.fn()
  }
}

describe('mountBrowserAudio', () => {
  it('plays uiClick when an overlay button is clicked', () => {
    const overlays = document.createElement('div')
    const button = document.createElement('button')
    overlays.append(button)
    const audio = fakeAudio()
    mountBrowserAudio({ overlays, cleanup: createCleanupStack() }, { create: () => audio })
    button.click()
    expect(audio.plays).toEqual(['uiClick'])
  })

  it('resumes on the first pointerdown and disposes with the host', () => {
    const audio = fakeAudio()
    const cleanup = createCleanupStack()
    mountBrowserAudio({ overlays: document.createElement('div'), cleanup }, { create: () => audio })
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('pointerdown'))
    expect(audio.resume).toHaveBeenCalledTimes(1)
    cleanup.dispose()
    expect(audio.dispose).toHaveBeenCalledTimes(1)
  })
})
