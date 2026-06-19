import { describe, expect, it } from 'vitest'
import { DataLoadError, parseData } from '@automata/engine'
import { physicsTuningKind, toPhysicsTuning } from '../../src/data/config'
import { readDataFile } from '../helpers/data'

describe('physics tuning', () => {
  it('parses the shipped physics.toml into camelCase tuning', () => {
    const raw = parseData(physicsTuningKind, readDataFile('config/physics.toml'), 'physics.toml')
    const tuning = toPhysicsTuning(raw)
    expect(tuning.maxTiltRad).toBeCloseTo((12 * Math.PI) / 180)
    expect(tuning.tiltSmooth).toBe(0.15)
    expect(tuning.gravity).toBe(9.81)
    expect(tuning.ball).toEqual({ radius: 0.5, friction: 0.6 })
  })

  it('rejects out-of-range values with a DataLoadError', () => {
    const bad = 'max-tilt-deg = 90.0\ntilt-smooth = 0.15\ngravity = 9.81\n[ball]\nradius = 0.5\nfriction = 0.6'
    expect(() => parseData(physicsTuningKind, bad, 'physics.toml')).toThrow(DataLoadError)
  })

  it('rejects a missing ball section', () => {
    expect(() => parseData(physicsTuningKind, 'max-tilt-deg = 12.0\ntilt-smooth = 0.1\ngravity = 9.81', 'physics.toml'))
      .toThrow(DataLoadError)
  })
})
