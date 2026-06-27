import { describe, expect, it } from 'vitest'
import * as engine from '../../src/index'

interface CleanupStack {
  readonly disposed: boolean
  defer(cleanup: () => void): void
  dispose(): void
}

describe('createCleanupStack', () => {
  it('drains once in LIFO order, preserving the first cleanup failure', () => {
    const createCleanupStack = (
      engine as unknown as { createCleanupStack?: () => CleanupStack }
    ).createCleanupStack
    expect(typeof createCleanupStack).toBe('function')
    if (!createCleanupStack) return

    const calls: string[] = []
    const cleanup = createCleanupStack()
    cleanup.defer(() => calls.push('first'))
    cleanup.defer(() => { calls.push('second'); throw new Error('boom') })
    cleanup.defer(() => calls.push('third'))

    expect(() => cleanup.dispose()).toThrow('boom')
    expect(calls).toEqual(['third', 'second', 'first'])
    expect(cleanup.disposed).toBe(true)

    cleanup.dispose()
    expect(calls).toHaveLength(3)
    cleanup.defer(() => calls.push('late'))
    expect(calls.at(-1)).toBe('late')
  })
})
