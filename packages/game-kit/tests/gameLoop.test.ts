import { describe, expect, it, vi } from 'vitest'
import { createCleanupStack, GameLoop } from '@automata/engine'
import { startGameLoop } from '../src/gameLoop'

describe('startGameLoop', () => {
  it('drives game hooks then renders the frame, and stops on cleanup dispose', () => {
    const events: string[] = []
    const stop = vi.fn()
    let captured: { fixedUpdate: (dt: number) => void; render: (alpha: number, dt: number) => void } | undefined
    const cleanup = createCleanupStack()
    startGameLoop(
      {
        fixedUpdate: () => events.push('fixed'),
        render: () => events.push('render'),
        renderFrame: () => events.push('frame'),
        onBlurPause: () => events.push('blur')
      },
      cleanup,
      {
        createLoop: (spec) => { captured = spec; return {} as GameLoop },
        drive: (_loop, onBlur) => { onBlur?.(); return { stop } }
      }
    )
    captured!.fixedUpdate(0.016)
    captured!.render(1, 0.016)
    expect(events).toEqual(['blur', 'fixed', 'render', 'frame'])
    cleanup.dispose()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
