import { describe, expect, it } from 'vitest'
import { EventQueue } from '../../src/ecs/events'

describe('EventQueue', () => {
  it('returns emitted events filtered by type', () => {
    const queue = new EventQueue()
    const a = { id: 'a' }, b = { id: 'b' }
    queue.emit({ type: 'sensorEnter', a, b })
    queue.emit({ type: 'contactStart', a, b })
    queue.emit({ type: 'sensorEnter', a: b, b: a })

    const sensors = queue.read('sensorEnter')
    expect(sensors).toHaveLength(2)
    expect(sensors[0]).toMatchObject({ a, b })
  })

  it('returns [] when no events of that type exist', () => {
    expect(new EventQueue().read('contactStart')).toEqual([])
  })

  it('clear() empties the queue (called at frame end)', () => {
    const queue = new EventQueue()
    queue.emit({ type: 'custom' })
    queue.clear()
    expect(queue.read('custom')).toEqual([])
  })
})
