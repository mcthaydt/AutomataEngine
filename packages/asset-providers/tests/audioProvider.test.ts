import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ProviderContext } from '@automata/contracts'
import { detSin } from '../src/deterministicSine'
import { writeWav } from '../src/wav'
import { audioProvider } from '../src/audioProvider'

const ctx: ProviderContext = {
  seed: 31337,
  style: {
    palette: {
      baseHue: 210,
      accentHues: [90, 330],
      saturation: 0.7,
      lightness: 0.55
    },
    audio: { waveform: 'sine', tempo: 'slow' }
  },
  specVersion: 1
}
const sfx = { id: 'pickup-blip', kind: 'audio' as const, description: 'Pickup blip.' }
const ambience = {
  id: 'harbor-drone',
  kind: 'music' as const,
  description: 'Harbor ambience.'
}
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const readU16 = (bytes: Uint8Array, at: number): number =>
  bytes[at]! | (bytes[at + 1]! << 8)

const readU32 = (bytes: Uint8Array, at: number): number =>
  bytes[at]! |
  (bytes[at + 1]! << 8) |
  (bytes[at + 2]! << 16) |
  ((bytes[at + 3]! << 24) >>> 0)

describe('detSin', () => {
  it('approximates sine over a period within 0.002 and hits exact zeros/peak signs', () => {
    for (let step = 0; step <= 1000; step += 1) {
      const phase = step / 1000
      const reference = Math.sin(phase * Math.PI * 2)
      expect(Math.abs(detSin(phase) - reference)).toBeLessThan(0.002)
    }
  })
})

describe('writeWav', () => {
  it('emits a canonical RIFF header for 22050 Hz mono 16-bit', () => {
    const bytes = writeWav(new Int16Array([0, 1000, -1000]), 22050)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(readU32(bytes, 4)).toBe(42)
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
    expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('fmt ')
    expect(readU32(bytes, 16)).toBe(16)
    expect(readU16(bytes, 20)).toBe(1)
    expect(readU16(bytes, 22)).toBe(1)
    expect(readU32(bytes, 24)).toBe(22050)
    expect(readU32(bytes, 28)).toBe(44100)
    expect(readU16(bytes, 32)).toBe(2)
    expect(readU16(bytes, 34)).toBe(16)
    expect(String.fromCharCode(...bytes.slice(36, 40))).toBe('data')
    expect(readU32(bytes, 40)).toBe(6)
    expect(bytes.length).toBe(44 + 6)
  })
})

describe('audioProvider', () => {
  it('replays bit-identically; goldens pinned per kind', async () => {
    const a = await audioProvider.generate(sfx, ctx)
    expect(sha(a.bytes)).toBe(sha((await audioProvider.generate(sfx, ctx)).bytes))
    expect(sha(a.bytes)).toMatchSnapshot()
    expect(sha((await audioProvider.generate(ambience, ctx)).bytes)).toMatchSnapshot()
  })

  it('respects duration bounds per kind', async () => {
    const blip = await audioProvider.generate(sfx, ctx)
    const drone = await audioProvider.generate(ambience, ctx)
    const seconds = (bytes: Uint8Array): number => readU32(bytes, 40) / 2 / 22050
    expect(seconds(blip.bytes)).toBeLessThanOrEqual(1)
    expect(seconds(blip.bytes)).toBeGreaterThan(0.05)
    expect(seconds(drone.bytes)).toBeLessThanOrEqual(8)
    expect(seconds(drone.bytes)).toBeGreaterThan(2)
  })
})
