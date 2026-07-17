import type { AssetProvider, ProviderContext } from '@automata/contracts'
import { createSeededRng, type SeededRng } from '@automata/engine'
import { detSin } from './deterministicSine'
import { writeWav } from './wav'

const SAMPLE_RATE = 22050
const TEMPO_HZ = { slow: 0.25, mid: 0.5, brisk: 1 } as const

const osc = (waveform: 'sine' | 'triangle' | 'square', phase: number): number => {
  if (waveform === 'sine') return detSin(phase)
  const t = phase - Math.floor(phase)
  if (waveform === 'triangle') return t < 0.5 ? t * 4 - 1 : 3 - t * 4
  return t < 0.5 ? 1 : -1
}

/** Render a short seeded blip with a randomized pitch and multiplicative decay. */
function renderSfx(
  rng: SeededRng,
  waveform: 'sine' | 'triangle' | 'square'
): Int16Array {
  const seconds = 0.2 + rng.next() * 0.6
  const pitch = 220 + rng.nextInt(660)
  const sweep = 0.5 + rng.next()
  const count = Math.floor(seconds * SAMPLE_RATE)
  const samples = new Int16Array(count)
  let envelope = 1
  const decay = 1 - 4 / count
  for (let index = 0; index < count; index += 1) {
    const time = index / SAMPLE_RATE
    const value = osc(waveform, time * (pitch + sweep * pitch * time))
    samples[index] = Math.round(value * envelope * 20000)
    envelope *= decay
  }
  return samples
}

/** Render layered slow oscillators with symmetric fades for a quiet loop seam. */
function renderAmbience(
  rng: SeededRng,
  waveform: 'sine' | 'triangle' | 'square',
  tempoHz: number
): Int16Array {
  const seconds = 4 + rng.nextInt(5)
  const count = Math.floor(seconds * SAMPLE_RATE)
  const samples = new Int16Array(count)
  const base = 55 + rng.nextInt(75)
  const layers = [1, 1.5, 2.01].map((ratio) => ({
    ratio,
    gain: 0.3 + rng.next() * 0.3
  }))
  const fade = Math.floor(SAMPLE_RATE * 0.25)
  for (let index = 0; index < count; index += 1) {
    const time = index / SAMPLE_RATE
    let value = 0
    for (const layer of layers) {
      const wobble = 1 + 0.01 * detSin(time * tempoHz)
      value += osc(waveform, time * base * layer.ratio * wobble) * layer.gain
    }
    const edge = Math.min(1, index / fade, (count - 1 - index) / fade)
    samples[index] = Math.round(value * edge * 9000)
  }
  return samples
}

export const audioProvider: AssetProvider = {
  id: 'procedural-audio',
  version: '1.0.0',
  kinds: ['audio', 'music'],
  fileExtension: () => 'wav',
  async generate(requirement, ctx: ProviderContext) {
    const rng = createSeededRng(ctx.seed)
    const samples = requirement.kind === 'music'
      ? renderAmbience(rng, ctx.style.audio.waveform, TEMPO_HZ[ctx.style.audio.tempo])
      : renderSfx(rng, ctx.style.audio.waveform)
    return {
      bytes: writeWav(samples, SAMPLE_RATE),
      provenance: {
        provider: audioProvider.id,
        providerVersion: audioProvider.version,
        generator: requirement.kind === 'music' ? 'ambience-loop@1' : 'sfx-blip@1',
        sourceParams: { kind: requirement.kind },
        seed: ctx.seed,
        specVersion: ctx.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally synthesized.' }
      }
    }
  }
}
