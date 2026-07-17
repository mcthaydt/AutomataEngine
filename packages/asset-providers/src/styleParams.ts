import type { StyleParams } from '@automata/contracts'
import { createSeededRng, hashStringToSeed } from '@automata/engine'

const WAVEFORMS = ['sine', 'triangle', 'square'] as const
const TEMPOS = ['slow', 'mid', 'brisk'] as const

const round2 = (value: number): number => Math.round(value * 100) / 100

/** One shared style definition feeds every provider for visual-family consistency. */
export function deriveStyleParams(
  direction: { visualStyle: string; audioStyle: string },
  seed: number
): StyleParams {
  const visual = createSeededRng(hashStringToSeed(`${seed}:visual:${direction.visualStyle}`))
  const audio = createSeededRng(hashStringToSeed(`${seed}:audio:${direction.audioStyle}`))
  const baseHue = visual.nextInt(360)
  return {
    palette: {
      baseHue,
      accentHues: [
        (baseHue + 120 + visual.nextInt(60)) % 360,
        (baseHue + 240 + visual.nextInt(60)) % 360
      ],
      saturation: round2(0.4 + visual.next() * 0.5),
      lightness: round2(0.35 + visual.next() * 0.35)
    },
    audio: {
      waveform: WAVEFORMS[audio.nextInt(WAVEFORMS.length)]!,
      tempo: TEMPOS[audio.nextInt(TEMPOS.length)]!
    }
  }
}
