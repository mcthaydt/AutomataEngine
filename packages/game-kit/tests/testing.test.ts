import { describe, expect, it } from 'vitest'
import { nullRuntime, stick } from '../src/testing'

describe('testing primitives', () => {
  it('stick reports a fixed input vector', () => {
    expect(stick({ x: 1, y: -1 }).read()).toEqual({ x: 1, y: -1 })
    expect(stick().read()).toEqual({ x: 0, y: 0 })
  })

  it('stick disposes without error', () => {
    expect(() => stick().dispose()).not.toThrow()
  })

  it('nullRuntime bundles recording render + audio doubles', () => {
    const rt = nullRuntime()
    expect(rt.render.port.objectCount).toBe(0)
    rt.audio.port.register('x', { freq: 1, durationS: 0.1, type: 'sine', gain: 0.1 })
    rt.audio.port.play('x')
    expect(rt.audio.calls.some((c) => c.op === 'play')).toBe(true)
  })
})
