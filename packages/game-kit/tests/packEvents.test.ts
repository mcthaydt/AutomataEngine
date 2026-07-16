import { describe, expect, it } from 'vitest'
import { createPackEventBus } from '../src/packEvents'

describe('createPackEventBus (pack contract v2)', () => {
  it('delivers a payload to every subscriber of that event, in subscription order', () => {
    const bus = createPackEventBus()
    const seen: string[] = []
    bus.on('itemAcquired', (payload) => seen.push(`a:${(payload as { itemId: string }).itemId}`))
    bus.on('itemAcquired', (payload) => seen.push(`b:${(payload as { itemId: string }).itemId}`))
    bus.emit('itemAcquired', { itemId: 'item-1' })
    expect(seen).toEqual(['a:item-1', 'b:item-1'])
  })

  it('does not deliver to other event names or after unsubscribe', () => {
    const bus = createPackEventBus()
    const seen: string[] = []
    const off = bus.on('questCompleted', () => seen.push('quest'))
    bus.emit('itemAcquired', { itemId: 'item-1' })
    expect(seen).toEqual([])
    off()
    bus.emit('questCompleted', {})
    expect(seen).toEqual([])
  })

  it('emitting with no subscribers is a no-op', () => {
    expect(() => createPackEventBus().emit('anything', null)).not.toThrow()
  })

  it('a handler subscribed during an emit is not called for that emit', () => {
    const bus = createPackEventBus()
    const seen: string[] = []
    bus.on('e', () => {
      seen.push('first')
      bus.on('e', () => seen.push('late'))
    })
    bus.emit('e', null)
    expect(seen).toEqual(['first'])
  })
})
