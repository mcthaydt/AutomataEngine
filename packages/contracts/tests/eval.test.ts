import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  testPlayResultSchema,
  type HeadlessOpts,
  type PlayObservation,
  type TestPlayResult
} from '../src/eval'

describe('testPlayResultSchema', () => {
  it('parses the no-input rest baseline result', () => {
    const r: TestPlayResult = { outcome: 'incomplete', timeMs: 0, fallCount: 0, bananas: 0, steps: 180 }
    expect(testPlayResultSchema.parse(r)).toEqual(r)
  })

  it('rejects an invalid outcome', () => {
    expect(() =>
      testPlayResultSchema.parse({ outcome: 'won', timeMs: 0, fallCount: 0, bananas: 0, steps: 0 })
    ).toThrow()
  })
})

describe('HeadlessOpts.input', () => {
  it('declares the PlayObservation as the second input parameter', () => {
    expectTypeOf<Parameters<NonNullable<HeadlessOpts['input']>>>().toEqualTypeOf<
      [step: number, observation: PlayObservation]
    >()
  })

  it('receives a PlayObservation and returns a 2D tilt input', () => {
    const obs: PlayObservation = {
      step: 1,
      ball: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
      goal: { x: 0, y: 0, z: -6 }
    }
    const opts: HeadlessOpts = { maxSteps: 10, input: (step, o) => ({ x: o.goal.z, y: step }) }
    expect(opts.input!(2, obs)).toEqual({ x: -6, y: 2 })
  })

  it('still accepts a no-arg input lambda (backward compatible)', () => {
    const opts: HeadlessOpts = { maxSteps: 10, input: () => ({ x: 0, y: 1 }) }
    expect(
      opts.input!(0, {
        step: 0,
        ball: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
        goal: { x: 0, y: 0, z: 0 }
      })
    ).toEqual({ x: 0, y: 1 })
  })
})
