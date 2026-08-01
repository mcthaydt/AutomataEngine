# Phase 5 Cycle 6 — AI Audio/Music Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `claude-audio`, a text→audio-recipe provider for the `audio` and `music` kinds, and refactor `procedural-audio` to render through the same shared, bit-deterministic recipe path.

**Architecture:** A new `audioRecipe.ts` in `@automata/asset-providers` owns two zod schemas (`SfxRecipe`, `MusicRecipe`), one renderer, and one style-membership validator — exactly where `propRecipe.ts` sits. Both the procedural and the AI provider build a recipe and hand it to the same renderer, so the synthesis path is exercised from both directions. Claude never emits bytes; it emits a recipe.

**Tech Stack:** TypeScript, npm workspaces, vitest, zod v4 via `@automata/project`, `@anthropic-ai/sdk` (mocked in every test but the opt-in live smoke).

**Spec:** [`2026-08-01-phase-5-cycle-6-ai-audio-provider-design.md`](../../../../specs/active/2026-08/week-31/2026-08-01-phase-5-cycle-6-ai-audio-provider-design.md)
**Umbrella:** [`2026-07-14-phase-5-asset-pipeline-design.md`](../../../../specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md)

## Global Constraints

- **Never `import { z } from 'zod'`.** Import `z` from `@automata/project`. Lint enforces this.
- **No implementation-defined math on the audio path.** No `Math.sin`, `Math.cos`, `Math.exp`, or `Math.pow` with a fractional exponent. Use `detSin` (`packages/asset-providers/src/deterministicSine.ts`) and the frozen semitone table from Task 1. `Math.floor`, `Math.trunc`, `Math.abs`, `Math.min`, `Math.max`, `Math.round`, and integer `**` are fine.
- **Vitest project filters use the directory name:** `npx vitest run --project asset-providers`. The package-name form fails with "No projects matched the filter".
- **`asset-providers`, `asset-providers-ai`, and `editor-mcp-server` declare no `test` script** — `npm test -w <pkg>` does not work for them. Use `npx vitest run --project <dir>`.
- **The real Anthropic SDK is never called in the standard suite.** Tests inject a fake `MessagesClient`. Only `packages/asset-providers-ai/tests/live.test.ts` touches the network, and it is `describe.skipIf(!process.env.ANTHROPIC_API_KEY)`.
- **Existing budgets are the ceiling, copied verbatim** from `packages/asset-providers/src/validateMedia.ts:8-14`: `wavMaxBytes: 400_000`, `sfxMaxSeconds: 1`, `ambienceMaxSeconds: 8`, `wavPeakMax: 32_000`. Sample rate is `22050`, mono, 16-bit — `validateAssetMedia` rejects anything else.
- **`optimizeWav` rescales every non-silent WAV to `WAV_NORMALIZE_PEAK` (29491).** Unlike the SVG and prop optimizers it is never a no-op, so the pinned hash must be taken over post-optimization bytes. `buildGeneratedAsset` already does this; do not add a second hash.
- **No git worktrees** (AGENTS.md ground rule).
- **Run `npm run ci` and `npm run coverage`** before claiming the cycle is ready — `asset-providers` is coverage-sensitive.
- **Mark each step off in this document as it completes**, and make each documented commit.

---

### Task 1: Recipe schemas and the semitone table

**Files:**
- Create: `packages/asset-providers/src/audioRecipe.ts`
- Modify: `packages/asset-providers/src/index.ts` (add the export)
- Test: `packages/asset-providers/tests/audioRecipe.test.ts` (create)

**Interfaces:**
- Consumes: `MEDIA_BUDGETS` from `./validateMedia`.
- Produces: `SEMITONE_RATIOS`, `semitoneRatio(offset)`, `sfxRecipeSchema`, `musicRecipeSchema`, `audioRecipeSchema`, and the types `SfxRecipe`, `MusicRecipe`, `AudioRecipe`. Tasks 2-6 use these exact names.

- [ ] **Step 1: Write the failing test**

Create `packages/asset-providers/tests/audioRecipe.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MEDIA_BUDGETS } from '../src/validateMedia'
import {
  SEMITONE_RATIOS, musicRecipeSchema, semitoneRatio, sfxRecipeSchema
} from '../src/audioRecipe'

const sfx = () => ({
  kind: 'sfx' as const,
  formatVersion: 1 as const,
  waveform: 'square' as const,
  basePitchHz: 440,
  sweep: 0.5,
  seconds: 0.4,
  decay: 0.8
})

const music = () => ({
  kind: 'music' as const,
  formatVersion: 1 as const,
  waveform: 'sine' as const,
  basePitchHz: 110,
  stepSeconds: 0.25,
  layers: [
    { gain: 0.6, steps: [0, 3, 7, null, 5, 3, 0, null] },
    { gain: 0.4, steps: [12, null, 7, null, 12, null, 7, null] }
  ]
})

describe('semitone table', () => {
  it('pins twelve equal-temperament ratios', () => {
    expect(SEMITONE_RATIOS).toHaveLength(12)
    SEMITONE_RATIOS.forEach((ratio, index) => {
      expect(ratio).toBeCloseTo(2 ** (index / 12), 6)
    })
    expect(SEMITONE_RATIOS[0]).toBe(1)
  })

  it('shifts octaves by integer doubling in both directions', () => {
    expect(semitoneRatio(12)).toBeCloseTo(2, 9)
    expect(semitoneRatio(24)).toBeCloseTo(4, 9)
    expect(semitoneRatio(-12)).toBeCloseTo(0.5, 9)
    expect(semitoneRatio(-1)).toBeCloseTo(2 ** (-1 / 12), 6)
    expect(semitoneRatio(0)).toBe(1)
  })
})

describe('sfx recipe schema', () => {
  it('accepts a well-formed recipe', () => {
    expect(() => sfxRecipeSchema.parse(sfx())).not.toThrow()
  })

  it('cannot express a clip longer than the sfx budget', () => {
    expect(() => sfxRecipeSchema.parse({ ...sfx(), seconds: MEDIA_BUDGETS.sfxMaxSeconds + 0.01 })).toThrow()
  })

  it('rejects unknown keys and unknown waveforms', () => {
    expect(() => sfxRecipeSchema.parse({ ...sfx(), extra: 1 })).toThrow()
    expect(() => sfxRecipeSchema.parse({ ...sfx(), waveform: 'saw' })).toThrow()
  })
})

describe('music recipe schema', () => {
  it('accepts a well-formed recipe', () => {
    expect(() => musicRecipeSchema.parse(music())).not.toThrow()
  })

  it('cannot express a loop longer than the ambience budget', () => {
    const tooLong = { ...music(), stepSeconds: 1, layers: [
      { gain: 0.6, steps: Array.from({ length: 16 }, () => 0) }
    ] }
    expect(() => musicRecipeSchema.parse(tooLong)).toThrow(/exceeds the ambience budget/)
  })

  it('cannot express silence', () => {
    const allRests = { ...music(), layers: [{ gain: 0.6, steps: [null, null, null, null] }] }
    expect(() => musicRecipeSchema.parse(allRests)).toThrow(/at least one pitched step/)
  })

  it('caps layers at two and requires equal step counts', () => {
    const threeLayers = { ...music(), layers: [...music().layers, { gain: 0.2, steps: [0, 0, 0, 0, 0, 0, 0, 0] }] }
    expect(() => musicRecipeSchema.parse(threeLayers)).toThrow()
    const ragged = { ...music(), layers: [
      { gain: 0.6, steps: [0, 3, 7, null] },
      { gain: 0.4, steps: [0, 3] }
    ] }
    expect(() => musicRecipeSchema.parse(ragged)).toThrow(/same number of steps/)
  })

  it('caps summed layer gain below the peak ceiling', () => {
    const loud = { ...music(), layers: [
      { gain: 1, steps: [0, 3, 7, null] },
      { gain: 1, steps: [0, 3, 7, null] }
    ] }
    expect(() => musicRecipeSchema.parse(loud)).toThrow(/summed layer gain/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project asset-providers audioRecipe`
Expected: FAIL — cannot resolve `../src/audioRecipe`.

- [ ] **Step 3: Implement the schemas**

Create `packages/asset-providers/src/audioRecipe.ts`:

```ts
import { z } from '@automata/project'
import { MEDIA_BUDGETS } from './validateMedia'

/**
 * Audio recipe v1 (Phase 5 cycle 6). Claude emits one of these; the shared
 * renderer turns it into WAV. Both the procedural and the AI provider build
 * recipes, so the synthesis path has one implementation.
 *
 * Bounds are chosen so a schema-valid recipe cannot breach MEDIA_BUDGETS —
 * the budget is unreachable by construction rather than checked afterwards.
 */

/**
 * Equal-temperament ratios for one octave, frozen as literal constants.
 * `Math.pow` with a fractional exponent is implementation-defined, which is
 * the same hazard `detSin` exists to avoid; these are data, not computation.
 */
export const SEMITONE_RATIOS: readonly number[] = Object.freeze([
  1,
  1.0594630943592953,
  1.122462048309373,
  1.189207115002721,
  1.2599210498948732,
  1.3348398541700344,
  1.4142135623730951,
  1.4983070768766815,
  1.5874010519681994,
  1.681792830507429,
  1.7817974362806785,
  1.8877486253633868
])

/** Ratio for any semitone offset; octaves shift by integer doubling/halving. */
export function semitoneRatio(offset: number): number {
  const octave = Math.floor(offset / 12)
  const step = offset - octave * 12
  let ratio = SEMITONE_RATIOS[step]!
  if (octave > 0) for (let index = 0; index < octave; index += 1) ratio *= 2
  if (octave < 0) for (let index = 0; index < -octave; index += 1) ratio /= 2
  return ratio
}

const waveformSchema = z.enum(['sine', 'triangle', 'square'])

export const sfxRecipeSchema = z.strictObject({
  kind: z.literal('sfx'),
  formatVersion: z.literal(1),
  waveform: waveformSchema,
  basePitchHz: z.number().min(40).max(4000),
  /** Multiplier on the upward pitch sweep across the clip. */
  sweep: z.number().min(0).max(4),
  seconds: z.number().min(0.05).max(MEDIA_BUDGETS.sfxMaxSeconds),
  /** Fraction of amplitude remaining at the end of the clip. */
  decay: z.number().min(0).max(1)
})
export type SfxRecipe = z.infer<typeof sfxRecipeSchema>

const MAX_STEPS = 32
/** Two layers at 0.45 each peak at 0.9 of full scale, under wavPeakMax. */
const MAX_SUMMED_GAIN = 0.9

const baseMusicSchema = z.strictObject({
  kind: z.literal('music'),
  formatVersion: z.literal(1),
  waveform: waveformSchema,
  basePitchHz: z.number().min(40).max(1000),
  stepSeconds: z.number().min(0.05).max(1),
  layers: z.array(z.strictObject({
    gain: z.number().min(0.05).max(0.9),
    /** Semitone offset from basePitchHz, or null for a rest. */
    steps: z.array(z.number().int().min(-24).max(24).nullable()).min(2).max(MAX_STEPS)
  })).min(1).max(2)
})

export const musicRecipeSchema: z.ZodType<z.infer<typeof baseMusicSchema>> =
  baseMusicSchema.superRefine((recipe, ctx) => {
    const issue = (message: string): void => { ctx.addIssue({ code: 'custom', message }) }

    const stepCount = recipe.layers[0]!.steps.length
    if (recipe.layers.some((layer) => layer.steps.length !== stepCount)) {
      issue('all layers must have the same number of steps')
    }
    const seconds = stepCount * recipe.stepSeconds
    if (seconds > MEDIA_BUDGETS.ambienceMaxSeconds) {
      issue(`loop is ${seconds}s, which exceeds the ambience budget of ${MEDIA_BUDGETS.ambienceMaxSeconds}s`)
    }
    if (!recipe.layers.some((layer) => layer.steps.some((step) => step !== null))) {
      issue('a music recipe needs at least one pitched step; silence is not renderable')
    }
    const summed = recipe.layers.reduce((total, layer) => total + layer.gain, 0)
    if (summed > MAX_SUMMED_GAIN) {
      issue(`summed layer gain ${summed} exceeds the ${MAX_SUMMED_GAIN} ceiling`)
    }
  })
export type MusicRecipe = z.infer<typeof baseMusicSchema>

export const audioRecipeSchema = z.discriminatedUnion('kind', [sfxRecipeSchema, musicRecipeSchema])
export type AudioRecipe = SfxRecipe | MusicRecipe
```

`audioRecipeSchema` unions the **refined** music schema. Zod v4 accepts a `superRefine` wrapper as a discriminated-union member and still runs its refinements through the union — verified against this repo's zod version on 2026-08-01, at both the type level and at runtime. Earlier drafts of this plan claimed otherwise and routed around it; that workaround is gone.

- [ ] **Step 4: Add the export**

In `packages/asset-providers/src/index.ts`, add after line 3 (`export * from './propRecipe'`):

```ts
export * from './audioRecipe'
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npx vitest run --project asset-providers audioRecipe`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): audio recipe schemas + frozen semitone table"
```

---

### Task 2: The deterministic renderer

**Files:**
- Modify: `packages/asset-providers/src/audioRecipe.ts`
- Test: `packages/asset-providers/tests/audioRecipe.test.ts`

**Interfaces:**
- Consumes: `SfxRecipe`, `MusicRecipe`, `AudioRecipe`, `semitoneRatio` (Task 1); `detSin` from `./deterministicSine`.
- Produces: `AUDIO_SAMPLE_RATE`, `renderAudioRecipe(recipe: AudioRecipe): Int16Array`. Tasks 3, 4, 5 use these.

- [ ] **Step 1: Write the failing test**

Append to `packages/asset-providers/tests/audioRecipe.test.ts`:

```ts
import { AUDIO_SAMPLE_RATE, renderAudioRecipe } from '../src/audioRecipe'

const peakOf = (samples: Int16Array): number => {
  let peak = 0
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  return peak
}

describe('renderAudioRecipe', () => {
  it('renders an sfx clip of the requested length at the pipeline sample rate', () => {
    const samples = renderAudioRecipe(sfxRecipeSchema.parse(sfx()))
    expect(AUDIO_SAMPLE_RATE).toBe(22_050)
    expect(samples.length).toBe(Math.floor(0.4 * AUDIO_SAMPLE_RATE))
  })

  it('renders a music loop of stepCount * stepSeconds', () => {
    const samples = renderAudioRecipe(musicRecipeSchema.parse(music()))
    expect(samples.length).toBe(Math.floor(8 * 0.25 * AUDIO_SAMPLE_RATE))
  })

  it('replays bit-identically', () => {
    const first = renderAudioRecipe(musicRecipeSchema.parse(music()))
    const second = renderAudioRecipe(musicRecipeSchema.parse(music()))
    expect(Array.from(first)).toEqual(Array.from(second))
  })

  it('never renders silence from a schema-valid recipe', () => {
    expect(peakOf(renderAudioRecipe(sfxRecipeSchema.parse(sfx())))).toBeGreaterThan(0)
    expect(peakOf(renderAudioRecipe(musicRecipeSchema.parse(music())))).toBeGreaterThan(0)
  })

  it('stays under the validation peak ceiling before normalization', () => {
    expect(peakOf(renderAudioRecipe(musicRecipeSchema.parse(music()))))
      .toBeLessThanOrEqual(MEDIA_BUDGETS.wavPeakMax)
  })

  it('fades both loop edges to zero so the seam is clean', () => {
    const samples = renderAudioRecipe(musicRecipeSchema.parse(music()))
    expect(samples[0]).toBe(0)
    expect(samples[samples.length - 1]).toBe(0)
  })
})
```

Fold the new imports into the file's existing import block.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project asset-providers audioRecipe`
Expected: FAIL — `renderAudioRecipe` is not exported.

- [ ] **Step 3: Implement the renderer**

Append to `packages/asset-providers/src/audioRecipe.ts`:

```ts
import { detSin } from './deterministicSine'

/** The pipeline's only sample rate; validateAssetMedia rejects anything else. */
export const AUDIO_SAMPLE_RATE = 22_050

const FULL_SCALE = 30_000
const FADE_SECONDS = 0.25

/** Shared with audioProvider's original oscillator: deterministic by construction. */
function osc(waveform: 'sine' | 'triangle' | 'square', phase: number): number {
  if (waveform === 'sine') return detSin(phase)
  const t = phase - Math.floor(phase)
  if (waveform === 'triangle') return t < 0.5 ? t * 4 - 1 : 3 - t * 4
  return t < 0.5 ? 1 : -1
}

function renderSfx(recipe: SfxRecipe): Int16Array {
  const count = Math.floor(recipe.seconds * AUDIO_SAMPLE_RATE)
  const samples = new Int16Array(count)
  // Linear amplitude ramp from 1 to `decay`; no exp(), which is non-deterministic.
  for (let index = 0; index < count; index += 1) {
    const time = index / AUDIO_SAMPLE_RATE
    const progress = count > 1 ? index / (count - 1) : 0
    const envelope = 1 + (recipe.decay - 1) * progress
    const pitch = recipe.basePitchHz * (1 + recipe.sweep * progress)
    samples[index] = Math.round(osc(recipe.waveform, time * pitch) * envelope * FULL_SCALE * 0.66)
  }
  return samples
}

function renderMusic(recipe: MusicRecipe): Int16Array {
  const stepCount = recipe.layers[0]!.steps.length
  const count = Math.floor(stepCount * recipe.stepSeconds * AUDIO_SAMPLE_RATE)
  const samples = new Int16Array(count)
  const samplesPerStep = count / stepCount
  const fade = Math.floor(AUDIO_SAMPLE_RATE * FADE_SECONDS)
  for (let index = 0; index < count; index += 1) {
    const time = index / AUDIO_SAMPLE_RATE
    const step = Math.min(stepCount - 1, Math.floor(index / samplesPerStep))
    let value = 0
    for (const layer of recipe.layers) {
      const offset = layer.steps[step]
      if (offset === null || offset === undefined) continue
      value += osc(recipe.waveform, time * recipe.basePitchHz * semitoneRatio(offset)) * layer.gain
    }
    const edge = Math.min(1, index / fade, (count - 1 - index) / fade)
    samples[index] = Math.round(value * edge * FULL_SCALE)
  }
  return samples
}

/** One recipe to PCM samples. Pure, allocation-only, bit-identical per input. */
export function renderAudioRecipe(recipe: AudioRecipe): Int16Array {
  return recipe.kind === 'sfx' ? renderSfx(recipe) : renderMusic(recipe)
}
```

Fold the `detSin` import into the file's existing import block at the top.

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project asset-providers audioRecipe`
Expected: PASS.

If the "fades both loop edges to zero" test fails, `edge` is 0 at `index === 0` and at `index === count - 1` by construction — a non-zero first sample means `fade` was computed as 0, which happens only if `FADE_SECONDS * AUDIO_SAMPLE_RATE < 1`. It is 5512.

- [ ] **Step 5: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): deterministic audio recipe renderer"
```

---

### Task 3: Style-membership validation

**Files:**
- Modify: `packages/asset-providers/src/audioRecipe.ts`
- Test: `packages/asset-providers/tests/audioRecipe.test.ts`

**Interfaces:**
- Consumes: `AudioRecipe` (Task 1), `StyleParams` from `@automata/contracts`.
- Produces: `TEMPO_STEP_SECONDS`, `audioRecipeStyleErrors(recipe: AudioRecipe, style: StyleParams): string[]`. Tasks 4, 5, and 7 use it.

- [ ] **Step 1: Write the failing test**

Append to `packages/asset-providers/tests/audioRecipe.test.ts`:

```ts
import type { StyleParams } from '@automata/contracts'
import { audioRecipeStyleErrors, TEMPO_STEP_SECONDS } from '../src/audioRecipe'

const style = (waveform: 'sine' | 'triangle' | 'square', tempo: 'slow' | 'mid' | 'brisk'): StyleParams => ({
  palette: { baseHue: 200, accentHues: [320, 80], saturation: 0.6, lightness: 0.5 },
  audio: { waveform, tempo }
})

describe('audioRecipeStyleErrors', () => {
  it('accepts a recipe that matches the style', () => {
    expect(audioRecipeStyleErrors(sfxRecipeSchema.parse(sfx()), style('square', 'mid'))).toEqual([])
  })

  it('rejects an off-style waveform', () => {
    const errors = audioRecipeStyleErrors(sfxRecipeSchema.parse(sfx()), style('sine', 'mid'))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/waveform "square".*style waveform "sine"/)
  })

  it('rejects a music recipe whose step duration is outside the tempo band', () => {
    const brisk = musicRecipeSchema.parse({ ...music(), stepSeconds: TEMPO_STEP_SECONDS.brisk.min })
    expect(audioRecipeStyleErrors(brisk, style('sine', 'brisk'))).toEqual([])
    const errors = audioRecipeStyleErrors(brisk, style('sine', 'slow'))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/step duration/)
  })

  it('does not apply the tempo band to sfx', () => {
    expect(audioRecipeStyleErrors(sfxRecipeSchema.parse(sfx()), style('square', 'brisk'))).toEqual([])
  })

  it('covers every tempo with a non-empty, non-overlapping band', () => {
    const bands = Object.values(TEMPO_STEP_SECONDS)
    for (const band of bands) expect(band.max).toBeGreaterThan(band.min)
    expect(TEMPO_STEP_SECONDS.brisk.max).toBeLessThanOrEqual(TEMPO_STEP_SECONDS.mid.min)
    expect(TEMPO_STEP_SECONDS.mid.max).toBeLessThanOrEqual(TEMPO_STEP_SECONDS.slow.min)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project asset-providers audioRecipe`
Expected: FAIL — `audioRecipeStyleErrors` is not exported.

- [ ] **Step 3: Implement the validator**

Append to `packages/asset-providers/src/audioRecipe.ts`:

```ts
/**
 * Step-duration bands per style tempo. Faster tempo means shorter steps, so
 * the bands run brisk → slow in ascending duration and do not overlap.
 */
export const TEMPO_STEP_SECONDS = {
  brisk: { min: 0.05, max: 0.15 },
  mid: { min: 0.15, max: 0.35 },
  slow: { min: 0.35, max: 1 }
} as const

/**
 * Style membership, the audio analogue of propRecipePaletteErrors: waveform is
 * the timbre palette a recipe must sit inside, and a music recipe's step
 * duration must match the game's tempo band. The motif itself stays free.
 */
export function audioRecipeStyleErrors(recipe: AudioRecipe, style: StyleParams): string[] {
  const errors: string[] = []
  if (recipe.waveform !== style.audio.waveform) {
    errors.push(`uses waveform "${recipe.waveform}" but the style waveform is "${style.audio.waveform}"`)
  }
  if (recipe.kind === 'music') {
    const band = TEMPO_STEP_SECONDS[style.audio.tempo]
    if (recipe.stepSeconds < band.min || recipe.stepSeconds > band.max) {
      errors.push(
        `has step duration ${recipe.stepSeconds}s, outside the "${style.audio.tempo}" band ${band.min}-${band.max}s`
      )
    }
  }
  return errors
}
```

Add `import type { StyleParams } from '@automata/contracts'` to the file's import block.

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project asset-providers`
Expected: PASS — the whole package, not just this file.

- [ ] **Step 5: Commit**

```bash
git add packages/asset-providers
git commit -m "feat(asset-providers): audio recipe style-membership validation"
```

---

### Task 4: Refactor `procedural-audio` onto the shared path

**Files:**
- Modify: `packages/asset-providers/src/audioProvider.ts` (replace the whole file body)
- Test: `packages/asset-providers/tests/audioProvider.test.ts` (exists — append)
- Update: `packages/asset-providers/tests/__snapshots__/audioProvider.test.ts.snap`

> **Read this before starting.** `audioProvider.test.ts:72-73` snapshots the
> **sha256 of the generated bytes** for both an sfx and an ambience asset. This
> refactor deliberately changes procedural audio output, so those two snapshots
> *will* fail and *must* be re-recorded with `-u` (Step 5). A failing byte-hash
> snapshot here is the expected result of the change, not a regression to revert.

**Interfaces:**
- Consumes: `renderAudioRecipe`, `AUDIO_SAMPLE_RATE`, `audioRecipeStyleErrors`, `sfxRecipeSchema`, `musicRecipeSchema`, `TEMPO_STEP_SECONDS` (Tasks 1-3); `writeWav` from `./wav`.
- Produces: `seedAudioRecipe(kind, style, rng): AudioRecipe` (exported for the tests and for symmetry with the AI path). `audioProvider` keeps its `id`/`version`.

- [ ] **Step 1: Write the failing test**

Append to the existing `packages/asset-providers/tests/audioProvider.test.ts`, reusing its current imports and requirement/context fixtures:

```ts
import { createSeededRng } from '@automata/engine'
import {
  audioProvider, audioRecipeStyleErrors, musicRecipeSchema, seedAudioRecipe, sfxRecipeSchema
} from '../src/index'

const styleFor = (waveform: 'sine' | 'triangle' | 'square', tempo: 'slow' | 'mid' | 'brisk') => ({
  palette: { baseHue: 200, accentHues: [320, 80], saturation: 0.6, lightness: 0.5 },
  audio: { waveform, tempo }
})

describe('procedural-audio on the shared recipe path', () => {
  it('seeds a schema-valid, style-clean sfx recipe', () => {
    const style = styleFor('triangle', 'mid')
    const recipe = seedAudioRecipe('audio', style, createSeededRng(7))
    expect(() => sfxRecipeSchema.parse(recipe)).not.toThrow()
    expect(audioRecipeStyleErrors(recipe, style)).toEqual([])
  })

  it('seeds a schema-valid, style-clean motif for every tempo', () => {
    for (const tempo of ['slow', 'mid', 'brisk'] as const) {
      const style = styleFor('sine', tempo)
      const recipe = seedAudioRecipe('music', style, createSeededRng(9))
      expect(() => musicRecipeSchema.parse(recipe), tempo).not.toThrow()
      expect(audioRecipeStyleErrors(recipe, style), tempo).toEqual([])
    }
  })

  it('replays bit-identically from the same seed', async () => {
    const ctx = { seed: 42, style: styleFor('sine', 'mid'), specVersion: 1 }
    const first = await audioProvider.generate({ id: 'a', kind: 'music', description: 'x' } as never, ctx as never)
    const second = await audioProvider.generate({ id: 'a', kind: 'music', description: 'x' } as never, ctx as never)
    expect(Array.from(first.bytes)).toEqual(Array.from(second.bytes))
  })

  it('records the recipe in provenance and stays seeded', async () => {
    const result = await audioProvider.generate(
      { id: 'a', kind: 'audio', description: 'x' } as never,
      { seed: 42, style: styleFor('square', 'mid'), specVersion: 1 } as never
    )
    expect(result.provenance.determinism).toEqual({ kind: 'seeded' })
    expect(result.provenance.generator).toBe('sfx-recipe@1')
    expect(result.provenance.sourceParams.recipe).toBeDefined()
  })
})
```

Match the existing test file's `describe`/`it` imports from vitest and the exact `AssetRequirement`/`ProviderContext` construction its neighbours use; the `as never` casts above are a stand-in for whatever fixture helper already exists.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project asset-providers audioProvider`
Expected: FAIL — `seedAudioRecipe` is not exported and `generator` is still `sfx-blip@1`.

- [ ] **Step 3: Rewrite the provider**

Replace the contents of `packages/asset-providers/src/audioProvider.ts`:

```ts
import type { AssetKind, AssetProvider, ProviderContext, StyleParams } from '@automata/contracts'
import { createSeededRng, type SeededRng } from '@automata/engine'
import {
  AUDIO_SAMPLE_RATE, TEMPO_STEP_SECONDS, renderAudioRecipe,
  type AudioRecipe, type MusicRecipe, type SfxRecipe
} from './audioRecipe'
import { writeWav } from './wav'

const round2 = (value: number): number => Math.round(value * 100) / 100
/** A pentatonic set keeps seeded motifs consonant without a key model. */
const MOTIF_DEGREES = [0, 3, 5, 7, 10, 12] as const

function seedSfx(style: StyleParams, rng: SeededRng): SfxRecipe {
  return {
    kind: 'sfx',
    formatVersion: 1,
    waveform: style.audio.waveform,
    basePitchHz: 220 + rng.nextInt(660),
    sweep: round2(0.5 + rng.next()),
    seconds: round2(0.2 + rng.next() * 0.6),
    decay: round2(rng.next() * 0.2)
  }
}

function seedMusic(style: StyleParams, rng: SeededRng): MusicRecipe {
  const band = TEMPO_STEP_SECONDS[style.audio.tempo]
  const stepSeconds = round2(band.min + rng.next() * (band.max - band.min))
  const stepCount = 8
  const draw = (): number => MOTIF_DEGREES[rng.nextInt(MOTIF_DEGREES.length)]!
  const lead = Array.from({ length: stepCount }, () => (rng.next() < 0.25 ? null : draw()))
  // Guarantee the schema's "at least one pitched step" invariant.
  if (lead.every((step) => step === null)) lead[0] = 0
  const pad = Array.from({ length: stepCount }, (_, index) => (index % 4 === 0 ? draw() - 12 : null))
  return {
    kind: 'music',
    formatVersion: 1,
    waveform: style.audio.waveform,
    basePitchHz: 110 + rng.nextInt(110),
    stepSeconds,
    layers: [{ gain: 0.5, steps: lead }, { gain: 0.3, steps: pad }]
  }
}

/** Seed the recipe the procedural provider renders; exported for symmetry with claude-audio. */
export function seedAudioRecipe(kind: AssetKind, style: StyleParams, rng: SeededRng): AudioRecipe {
  return kind === 'music' ? seedMusic(style, rng) : seedSfx(style, rng)
}

export const audioProvider: AssetProvider = {
  id: 'procedural-audio',
  version: '1.0.0',
  kinds: ['audio', 'music'],
  fileExtension: () => 'wav',
  async generate(requirement, ctx: ProviderContext) {
    const recipe = seedAudioRecipe(requirement.kind, ctx.style, createSeededRng(ctx.seed))
    return {
      bytes: writeWav(renderAudioRecipe(recipe), AUDIO_SAMPLE_RATE),
      provenance: {
        provider: audioProvider.id,
        providerVersion: audioProvider.version,
        generator: recipe.kind === 'music' ? 'motif-loop@1' : 'sfx-recipe@1',
        sourceParams: { kind: requirement.kind, recipe },
        seed: ctx.seed,
        specVersion: ctx.specVersion,
        determinism: { kind: 'seeded' },
        license: { kind: 'generated', notes: 'Procedurally synthesized from a seeded audio recipe.' }
      }
    }
  }
}
```

The old `renderSfx`, `renderAmbience`, `osc`, `SAMPLE_RATE`, and `TEMPO_HZ` are gone — `osc` now lives in `audioRecipe.ts`. Delete the now-unused `detSin` import from this file.

- [ ] **Step 4: Run and see exactly two snapshot failures**

Run: `npx vitest run --project asset-providers audioProvider`
Expected: the new tests PASS; the two byte-hash snapshots at `audioProvider.test.ts:72-73` FAIL. Confirm the failures are *only* those two snapshots. Any other failure is a real bug — most likely a test asserting the retired `sfx-blip@1` / `ambience-loop@1` generator ids, which should be updated to `sfx-recipe@1` / `motif-loop@1`.

- [ ] **Step 5: Re-record the snapshots and run the whole package**

```bash
npx vitest run --project asset-providers audioProvider -u
npx vitest run --project asset-providers
```

Expected: PASS. Review the snapshot diff before committing — two sha strings should change and nothing else.

- [ ] **Step 6: Confirm no checked-in game changed**

Run: `git status --short games/`
Expected: empty. `games/first-light/public/assets/assets.json` holds one `ui` SVG and no audio, so nothing regenerates.

- [ ] **Step 7: Commit**

```bash
git add packages/asset-providers
git commit -m "refactor(asset-providers): procedural audio renders through the shared recipe"
```

---

### Task 5: The `claude-audio` provider

**Files:**
- Create: `packages/asset-providers-ai/src/claudeAudioProvider.ts`
- Modify: `packages/asset-providers-ai/src/index.ts`
- Test: `packages/asset-providers-ai/tests/claudeAudioProvider.test.ts` (create)

**Interfaces:**
- Consumes: `AiProviderError`, `isAuthenticationError`, `MessagesClient` from `./claudeSvgProvider`; `renderAudioRecipe`, `AUDIO_SAMPLE_RATE`, `audioRecipeStyleErrors`, `sfxRecipeSchema`, `musicRecipeSchema`, `TEMPO_STEP_SECONDS`, `writeWav`, `sha256Hex` from `@automata/asset-providers`.
- Produces: `buildAudioPrompt(requirement, style)`, `extractAudioRecipe(raw, kind, style)`, `createClaudeAudioProvider(options?)`. Tasks 6 and 7 use the last one.

- [ ] **Step 1: Write the failing test**

Create `packages/asset-providers-ai/tests/claudeAudioProvider.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StyleParams } from '@automata/contracts'
import { readWavInfo, sha256Hex } from '@automata/asset-providers'
import { AiProviderError } from '../src/claudeSvgProvider'
import { createClaudeAudioProvider, extractAudioRecipe } from '../src/claudeAudioProvider'

const style: StyleParams = {
  palette: { baseHue: 200, accentHues: [320, 80], saturation: 0.6, lightness: 0.5 },
  audio: { waveform: 'sine', tempo: 'mid' }
}

const MOTIF = {
  kind: 'music', formatVersion: 1, waveform: 'sine', basePitchHz: 110, stepSeconds: 0.25,
  layers: [{ gain: 0.5, steps: [0, 3, 7, null, 5, 3, 0, null] }]
}

const fakeClient = (text: string, stopReason: string | null = 'end_turn') => ({
  messages: { create: async () => ({ stop_reason: stopReason, content: [{ type: 'text', text }] }) }
})

const requirement = (kind: 'audio' | 'music') =>
  ({ id: `a-${kind}`, kind, description: 'a brooding harbor at dusk' }) as never
const ctx = { seed: 5, style, specVersion: 1 } as never

describe('extractAudioRecipe', () => {
  it('strips a markdown fence and returns a parsed recipe', () => {
    const recipe = extractAudioRecipe(`\`\`\`json\n${JSON.stringify(MOTIF)}\n\`\`\``, 'music', style)
    expect(recipe.kind).toBe('music')
  })

  it('rejects non-JSON', () => {
    expect(() => extractAudioRecipe('sorry, no', 'music', style)).toThrow(AiProviderError)
  })

  it('rejects a recipe whose kind does not match the requirement', () => {
    expect(() => extractAudioRecipe(JSON.stringify(MOTIF), 'audio', style)).toThrow(/expected an "sfx" recipe/)
  })

  it('rejects an off-style waveform', () => {
    const offStyle = JSON.stringify({ ...MOTIF, waveform: 'square' })
    expect(() => extractAudioRecipe(offStyle, 'music', style)).toThrow(/style waveform/)
  })

  it('rejects a schema-invalid recipe', () => {
    const silent = JSON.stringify({ ...MOTIF, layers: [{ gain: 0.5, steps: [null, null] }] })
    expect(() => extractAudioRecipe(silent, 'music', style)).toThrow(AiProviderError)
  })
})

describe('claude-audio provider', () => {
  it('generates a 22050 Hz mono WAV pinned by content hash', async () => {
    const provider = createClaudeAudioProvider({ client: fakeClient(JSON.stringify(MOTIF)) as never })
    const result = await provider.generate(requirement('music'), ctx)
    const info = readWavInfo(result.bytes)
    expect(info.sampleRate).toBe(22_050)
    expect(info.channels).toBe(1)
    expect(info.bitsPerSample).toBe(16)
    expect(result.provenance.determinism).toEqual({
      kind: 'pinned', contentHash: sha256Hex(result.bytes)
    })
  })

  it('declares both audio kinds and a wav extension', () => {
    const provider = createClaudeAudioProvider({ client: fakeClient('{}') as never })
    expect(provider.id).toBe('claude-audio')
    expect(provider.kinds).toEqual(['audio', 'music'])
    expect(provider.fileExtension(requirement('music'))).toBe('wav')
    expect(provider.cacheKey).toContain('claude-audio@1.0.0:model=')
  })

  it('records the recipe and prompt in provenance', async () => {
    const provider = createClaudeAudioProvider({ client: fakeClient(JSON.stringify(MOTIF)) as never })
    const result = await provider.generate(requirement('music'), ctx)
    expect(result.provenance.sourceParams.recipe).toEqual(MOTIF)
    expect(result.provenance.sourceParams.prompt).toContain('brooding harbor')
  })

  it('maps a refusal to the typed error', async () => {
    const provider = createClaudeAudioProvider({ client: fakeClient('{}', 'refusal') as never })
    await expect(provider.generate(requirement('music'), ctx)).rejects.toThrow(/ai-refusal/)
  })

  it('maps a missing key to the typed auth error', async () => {
    const failing = {
      messages: {
        create: async () => { throw new Error('Could not resolve authentication method. Expected either apiKey or authToken to be set.') }
      }
    }
    const provider = createClaudeAudioProvider({ client: failing as never })
    await expect(provider.generate(requirement('music'), ctx)).rejects.toThrow(/ai-auth-missing/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project asset-providers-ai claudeAudio`
Expected: FAIL — cannot resolve `../src/claudeAudioProvider`.

- [ ] **Step 3: Implement the provider**

Create `packages/asset-providers-ai/src/claudeAudioProvider.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { AssetProvider, AssetRequirement, StyleParams } from '@automata/contracts'
import {
  AUDIO_SAMPLE_RATE, TEMPO_STEP_SECONDS, audioRecipeStyleErrors, musicRecipeSchema,
  renderAudioRecipe, sfxRecipeSchema, sha256Hex, writeWav, type AudioRecipe
} from '@automata/asset-providers'
import { AiProviderError, isAuthenticationError, type MessagesClient } from './claudeSvgProvider'

/**
 * The third AI provider adapter (Phase 5 cycle 6): Claude text→audio recipe for
 * the `audio` and `music` kinds. Claude cannot emit audio bytes, so it emits a
 * recipe and the shared deterministic renderer produces the WAV. Style
 * membership is the audio analogue of palette membership.
 */
// Mirrors claude-svg and claude-prop deliberately: all AI providers move models
// together so a cacheKey change is one reviewed decision, not per-module drift.
const DEFAULT_MODEL = 'claude-opus-4-8'

export function buildAudioPrompt(
  requirement: AssetRequirement,
  style: StyleParams
): { system: string; user: string } {
  const band = TEMPO_STEP_SECONDS[style.audio.tempo]
  const shared = [
    'You compose short audio recipes for a deterministic game asset pipeline.',
    'Respond with exactly one JSON object and nothing else - no markdown fences, no prose.',
    `Every recipe must use "waveform": "${style.audio.waveform}".`
  ]
  const system = requirement.kind === 'music'
    ? [
      ...shared,
      'Schema: { "kind": "music", "formatVersion": 1, "waveform", "basePitchHz", "stepSeconds", "layers" }.',
      '"basePitchHz" is 40 to 1000. "layers" holds 1 or 2 entries, each',
      '{ "gain": 0.05 to 0.9, "steps": [ ... ] }. Every layer must have the SAME number of steps',
      '(2 to 32). Each step is an integer semitone offset from basePitchHz (-24 to 24) or null for a rest.',
      'At least one step across all layers must be pitched, and the layer gains must sum to 0.9 or less.',
      `"stepSeconds" must be between ${band.min} and ${band.max}, and stepCount * stepSeconds must not exceed 8.`,
      'Write a short loopable motif that suits the description.'
    ].join(' ')
    : [
      ...shared,
      'Schema: { "kind": "sfx", "formatVersion": 1, "waveform", "basePitchHz", "sweep", "seconds", "decay" }.',
      '"basePitchHz" is 40 to 4000, "sweep" is 0 to 4 (upward pitch bend across the clip),',
      '"seconds" is 0.05 to 1, and "decay" is 0 to 1 (amplitude remaining at the end).'
    ].join(' ')
  return { system, user: `Compose: ${requirement.description}.` }
}

/** Strip an optional fence, parse, check the kind matches, then check style membership. */
export function extractAudioRecipe(
  raw: string,
  kind: 'audio' | 'music',
  style: StyleParams
): AudioRecipe {
  let text = raw.trim()
  const fence = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  if (fence) text = fence[1]!.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AiProviderError('ai-malformed-output', `response is not valid JSON (got "${text.slice(0, 60)}")`)
  }
  const expected = kind === 'music' ? 'music' : 'sfx'
  const actual = (parsed as { kind?: unknown }).kind
  if (actual !== expected) {
    throw new AiProviderError('ai-malformed-output',
      `expected an "${expected}" recipe for a ${kind} asset, got "${String(actual)}"`)
  }
  const schema = expected === 'music' ? musicRecipeSchema : sfxRecipeSchema
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new AiProviderError('ai-malformed-output', `recipe invalid: ${result.error.message}`.slice(0, 200))
  }
  const recipe = result.data as AudioRecipe
  const styleErrors = audioRecipeStyleErrors(recipe, style)
  if (styleErrors.length > 0) {
    throw new AiProviderError('ai-malformed-output', `recipe ${styleErrors[0]}`)
  }
  return recipe
}

export function createClaudeAudioProvider(
  options: { client?: MessagesClient; model?: string } = {}
): AssetProvider {
  const model = options.model ?? DEFAULT_MODEL
  let client: MessagesClient | null = options.client ?? null
  // Lazy: defer SDK construction so server startup stays key-free until the first call.
  const resolveClient = (): MessagesClient => {
    client ??= new Anthropic() as unknown as MessagesClient
    return client
  }
  return {
    id: 'claude-audio',
    version: '1.0.0',
    cacheKey: `claude-audio@1.0.0:model=${model}`,
    kinds: ['audio', 'music'],
    fileExtension: () => 'wav',
    async generate(requirement, ctx) {
      const prompt = buildAudioPrompt(requirement, ctx.style)
      let response: Awaited<ReturnType<MessagesClient['messages']['create']>>
      try {
        response = await resolveClient().messages.create({
          model,
          max_tokens: 4096,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }]
        })
      } catch (error) {
        if (isAuthenticationError(error)) {
          throw new AiProviderError('ai-auth-missing',
            'Anthropic authentication failed - set ANTHROPIC_API_KEY (or run `ant auth login`) and retry')
        }
        throw error
      }
      if (response.stop_reason === 'refusal') {
        throw new AiProviderError('ai-refusal', `Claude declined to generate asset "${requirement.id}"`)
      }
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('')
      const recipe = extractAudioRecipe(text, requirement.kind as 'audio' | 'music', ctx.style)
      const bytes = writeWav(renderAudioRecipe(recipe), AUDIO_SAMPLE_RATE)
      // No byte-count guard: recipe bounds cap the clip at 8s, which is ~353 KB,
      // under the 400 KB wavMaxBytes budget. The bound is structural, not checked.
      return {
        bytes,
        provenance: {
          provider: 'claude-audio',
          providerVersion: '1.0.0',
          generator: model,
          sourceParams: { model, system: prompt.system, prompt: prompt.user, recipe },
          seed: ctx.seed,
          specVersion: ctx.specVersion,
          determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
          license: { kind: 'generated', notes: 'AI-generated via the Claude API.' }
        }
      }
    }
  }
}
```

Add to `packages/asset-providers-ai/src/index.ts`:

```ts
export * from './claudeAudioProvider'
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project asset-providers-ai`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/asset-providers-ai
git commit -m "feat(asset-providers-ai): claude-audio text->recipe provider"
```

---

### Task 6: Pin the post-optimization hash contract

The one behavior this cycle silently depends on: `optimizeWav` rewrites every non-silent WAV, so the provider's own `contentHash` is stale by the time the asset lands, and `buildGeneratedAsset` must recompute it. Nothing tests that today for audio.

**Files:**
- Test: `packages/asset-providers/tests/generate.test.ts`

**Interfaces:**
- Consumes: `buildGeneratedAsset` from `./generate`, `createClaudeAudioProvider` — but `asset-providers` must not depend on `asset-providers-ai`, so this test uses a **local stub provider** with `determinism: { kind: 'pinned' }`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `packages/asset-providers/tests/generate.test.ts`:

```ts
describe('pinned audio hash survives wav normalization', () => {
  it('recomputes contentHash over the optimized bytes', async () => {
    const rawSamples = renderAudioRecipe(sfxRecipeSchema.parse({
      kind: 'sfx', formatVersion: 1, waveform: 'sine',
      basePitchHz: 440, sweep: 0, seconds: 0.2, decay: 0.5
    }))
    const rawBytes = writeWav(rawSamples, AUDIO_SAMPLE_RATE)
    const stub: AssetProvider = {
      id: 'stub-pinned-audio',
      version: '1.0.0',
      kinds: ['audio'],
      fileExtension: () => 'wav',
      async generate() {
        return {
          bytes: rawBytes,
          provenance: {
            provider: 'stub-pinned-audio', providerVersion: '1.0.0', generator: 'stub',
            sourceParams: {}, seed: 1, specVersion: 1,
            determinism: { kind: 'pinned', contentHash: sha256Hex(rawBytes) },
            license: { kind: 'generated', notes: 'test' }
          }
        }
      }
    }
    const built = await buildGeneratedAsset(
      { id: 'sfx-1', kind: 'audio', description: 'x' } as never,
      stub,
      { seed: 1, style: styleFixture(), specVersion: 1 }
    )

    // Normalization ran, so the written bytes differ from what the provider returned.
    expect(Array.from(built.bytes)).not.toEqual(Array.from(rawBytes))
    expect(built.entry.transformations.map((t) => t.tool)).toContain('wav-normalize')
    // The pinned hash must describe the FINAL bytes, or validation fails downstream.
    expect(built.entry.provenance.determinism).toEqual({
      kind: 'pinned', contentHash: sha256Hex(built.bytes)
    })
    expect(validateAssetMedia(built.entry, built.bytes, null)
      .filter((issue) => issue.code === 'asset-hash-mismatch')).toEqual([])
  })
})
```

Reuse the file's existing style fixture instead of `styleFixture()` if it has one, and fold `renderAudioRecipe`, `sfxRecipeSchema`, `writeWav`, `AUDIO_SAMPLE_RATE`, `sha256Hex`, `validateAssetMedia`, and the `AssetProvider` type into its import block.

- [ ] **Step 2: Run it**

Run: `npx vitest run --project asset-providers generate`
Expected: **PASS on the first run.** `buildGeneratedAsset` already recomputes the pinned hash after optimization (`packages/asset-providers/src/generate.ts:49-50`), so this test pins existing behavior rather than driving new code. That is the point — it is a regression guard for the contract `claude-audio` relies on. If it *fails*, the recompute has regressed and that is a real bug to fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add packages/asset-providers
git commit -m "test(asset-providers): pin post-normalization hash contract for audio"
```

---

### Task 7: MCP injection and the live smoke

**Files:**
- Modify: `tools/editor-mcp-server/src/sessionHost.ts:3` (import) and `:62` (`namedProviders`)
- Test: `tools/editor-mcp-server/tests/assetTools.test.ts`
- Test: `packages/asset-providers-ai/tests/live.test.ts`

**Interfaces:**
- Consumes: `createClaudeAudioProvider` (Task 5).
- Produces: nothing.

- [ ] **Step 1: Write the failing routing test**

`namedProviders` is **not exposed on any host object** — it is a parameter threaded into the local `setup(...)` / `setupWithSpec(...)` helpers in `tools/editor-mcp-server/tests/assetTools.test.ts` (lines 44, 68, 77-78). Cycle 5's `describe('model provider override')` block (added in `fd30c5d`) is the precedent: it injects a **fake** provider and asserts end-to-end routing rather than asserting the real `sessionHost` wiring. Mirror that shape exactly.

Append to `tools/editor-mcp-server/tests/assetTools.test.ts`, next to the `model provider override` block:

```ts
const AUDIO_ONLY_ASSETS = [{ id: 'harbor-loop', kind: 'music', description: 'Harbor ambience.' }]

const fakeAudioProvider: AssetProvider = {
  id: 'fake-audio',
  version: '1.0.0',
  kinds: ['audio', 'music'],
  fileExtension: () => 'wav',
  async generate() {
    const bytes = writeWav(renderAudioRecipe(musicRecipeSchema.parse({
      kind: 'music', formatVersion: 1, waveform: 'sine', basePitchHz: 110, stepSeconds: 0.5,
      layers: [{ gain: 0.5, steps: [0, 3, 7, null] }]
    })), AUDIO_SAMPLE_RATE)
    return {
      bytes,
      provenance: {
        provider: 'fake-audio', providerVersion: '1.0.0', generator: 'fake-audio',
        sourceParams: {}, seed: 1, specVersion: 1,
        determinism: { kind: 'pinned', contentHash: sha256Hex(bytes) },
        license: { kind: 'generated', notes: 'test' }
      }
    }
  }
}

describe('audio provider override', () => {
  it('routes a music requirement through the injected audio provider and validates', async () => {
    const { runner, manifestPath } = await setupWithSpec(AUDIO_ONLY_ASSETS, { 'fake-audio': fakeAudioProvider })
    const result = await runner.execute('generateAssets', { provider: 'fake-audio' })
    expect(result.ok).toBe(true)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const entry = manifest.assets.find((a: { id: string }) => a.id === 'harbor-loop')
    expect(entry.provenance.provider).toBe('fake-audio')
    expect(entry.path.endsWith('.wav')).toBe(true)
    expect(entry.provenance.determinism.kind).toBe('pinned')
  })

  it('rejects a non-audio requirement routed to an audio-only provider', async () => {
    const { runner } = await setupWithSpec(
      [{ id: 'icon-a', kind: 'ui', description: 'An icon.' }],
      { 'fake-audio': fakeAudioProvider }
    )
    await expect(runner.execute('generateAssets', { provider: 'fake-audio' }))
      .resolves.toMatchObject({ ok: false })
  })
})
```

Match the exact destructuring, `runner.execute` argument shape, and manifest-reading idiom of the neighbouring `model provider override` block — the two must be structurally identical so a reviewer can diff them. Fold the new imports into the file's import block.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run --project editor-mcp-server assetTools`
Expected: FAIL — `renderAudioRecipe` and `musicRecipeSchema` do not resolve until Task 1-2 are merged, and the assertions have never run.

Note this block tests the **routing mechanism**, not `sessionHost`'s one-line wiring of the real `claude-audio`. That wiring is verified by typecheck alone, exactly as `claude-svg` and `claude-prop` are — instantiating them in a test would require a live SDK client.

- [ ] **Step 3: Inject the provider**

In `tools/editor-mcp-server/src/sessionHost.ts` line 3:

```ts
import {
  createClaudeAudioProvider, createClaudePropProvider, createClaudeSvgProvider
} from '@automata/asset-providers-ai'
```

Line 62:

```ts
    namedProviders: {
      'claude-svg': createClaudeSvgProvider(),
      'claude-prop': createClaudePropProvider(),
      'claude-audio': createClaudeAudioProvider()
    },
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run --project editor-mcp-server`
Expected: PASS.

- [ ] **Step 5: Add the opt-in live smoke**

Append to `packages/asset-providers-ai/tests/live.test.ts`, matching the two existing blocks:

```ts
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('claude-audio live smoke', () => {
  it('generates a style-clean, hash-pinned motif', { timeout: 120_000 }, async () => {
    const style: StyleParams = {
      palette: { baseHue: 200, accentHues: [320, 80], saturation: 0.6, lightness: 0.5 },
      audio: { waveform: 'sine', tempo: 'mid' }
    }
    const provider = createClaudeAudioProvider()
    const result = await provider.generate(
      { id: 'live-music', kind: 'music', description: 'a brooding harbor town at dusk' } as never,
      { seed: 1, style, specVersion: 1 } as never
    )
    const info = readWavInfo(result.bytes)
    expect(info.sampleRate).toBe(22_050)
    expect(info.channels).toBe(1)
    expect(info.sampleCount).toBeGreaterThan(0)
    expect(result.provenance.determinism).toEqual({
      kind: 'pinned', contentHash: sha256Hex(result.bytes)
    })
    const recipe = result.provenance.sourceParams.recipe as AudioRecipe
    expect(audioRecipeStyleErrors(recipe, style)).toEqual([])
  })
})
```

Fold the new imports into the file's existing import block.

- [ ] **Step 6: Confirm the standard suite still skips the live block**

Run: `npx vitest run --project asset-providers-ai`
Expected: PASS with the live blocks skipped (assuming `ANTHROPIC_API_KEY` is unset in the shell). If it is set, the live test runs and costs an API call — that is intended.

- [ ] **Step 7: Commit**

```bash
git add tools/editor-mcp-server packages/asset-providers-ai
git commit -m "feat(editor-mcp-server): inject claude-audio; add live smoke"
```

---

### Task 8: Regression pin, full gates, and ship documentation

**Files:**
- Modify: `packages/contracts/src/gameSpecFixtures.ts:38` (the shared spec fixture the editor MCP suite consumes)
- Modify: `docs/ROADMAP.md` (§1 Shipped Phase 5 entry, §3 Phase 5 cycles list)
- Modify: `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`
- Modify: `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md` (gap log)
- Modify: this plan (check every box)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: nothing.

- [ ] **Step 1: Give the shared spec fixture an audio requirement**

The fixture is `packages/contracts/src/gameSpecFixtures.ts:38`, which already reads:

```ts
    assets: [{ id: 'beacon-model', kind: 'model', description: 'The beacon.' }],
```

Cycle 5 added that `beacon-model` entry for exactly this reason. Add a sibling `music` requirement:

```ts
    assets: [
      { id: 'beacon-model', kind: 'model', description: 'The beacon.' },
      { id: 'harbor-theme', kind: 'music', description: 'Brooding harbor ambience.' }
    ],
```

**Do not add one to `games/first-light`** — it ships one `ui` SVG and no audio, which is why the spec names this fixture as the pin. Note this file lives in `@automata/contracts`, not in `editor-mcp-server`; the editor MCP suite merely consumes it, so expect fallout in any suite that asserts this fixture's asset count.

- [ ] **Step 2: Run every suite that consumes the fixture**

Run: `npx vitest run --project contracts --project editor-mcp-server --project game-compose`
Expected: PASS, with the new requirement generating through `procedural-audio` in the standard suite. Any assertion pinning the fixture's asset count or asset-id list needs the second entry added — that is expected churn from Step 1, not a regression.

- [ ] **Step 3: Run the full gates**

```bash
npm run ci
npm run coverage
```

Expected: both PASS. Fix anything red before the docs step.

- [ ] **Step 4: Append the capability gaps**

The Phase 5 umbrella has **no** capability-gap log — unlike the Phase 4 umbrella, whose §9 is the model to follow. Create one as a new final section in `docs/superpowers/specs/active/2026-07/week-29/2026-07-14-phase-5-asset-pipeline-design.md`, after §8 Risks:

```markdown
## 9. Capability-gap log

Deviations and deferrals logged per cycle, newest last. Cycles 1-5 recorded
theirs in their own specs; this log is the phase-level record from cycle 6 on.
```

Then append under it:

```markdown
- **Cycle 6 — monophonic layers, two maximum.** No chords within a layer and no
  percussion track.
- **Cycle 6 — one sample rate, one format.** PCM WAV at 22050 Hz; no compressed
  formats.
- **Cycle 6 — no cross-asset audio-family evaluator.** Style membership is
  per-asset; nothing checks that a release's audio set coheres.
- **Cycle 6 — tempo bands, not BPM.** `style.audio.tempo` stays a three-value
  enum, so a spec cannot request a specific tempo.
```

- [ ] **Step 5: Update the roadmap**

In `docs/ROADMAP.md` §3 Phase 5, append to the cycles list:

```markdown
  - Cycle 6 — third AI provider adapter (claude-audio, text→audio recipe for the
    `audio` and `music` kinds; shared deterministic renderer; style-membership
    validation) — `Shipped` (2026-08-01, plan:
    [`2026-08-01-phase-5-cycle-6-ai-audio-provider.md`](superpowers/plans/active/2026-08/week-31/2026-08-01-phase-5-cycle-6-ai-audio-provider.md)).
```

Phase 5 **stays `Shipped`** — its exit criteria were met at cycle 3. Update the §1 Shipped entry's date and cycle summary only.

- [ ] **Step 6: Update the decomposition counters**

In `docs/superpowers/specs/active/2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md`: change the §3 phase-map Phase 5 row from `5 cycles completed (2026-07-28)` to `6 cycles completed (2026-08-01)`; change the §5 Phase 5 header date to `2026-08-01`; add item 6 (`Third AI provider adapter (claude-audio, audio/music kinds) — completed`).

- [ ] **Step 7: Check every box in this plan**

Every `- [ ]` above must be `- [x]`.

- [ ] **Step 8: Commit**

```bash
git add docs tools/editor-mcp-server
git commit -m "docs: mark Phase 5 cycle 6 (claude-audio) shipped"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 two schemas, budgets unreachable by construction | Task 1 |
| §3.2 `Math.pow` hazard, frozen semitone table | Task 1 |
| §3.3 `renderAudioRecipe` | Task 2 |
| §3.3 `audioRecipeStyleErrors` | Task 3 |
| §4.1 procedural refactor, generator id bump, recipe in provenance | Task 4 |
| §4.2 `claude-audio`, shared primitives, pinned determinism | Task 5 |
| §4.2 post-optimization hash dependency, "a test pins the dependency" | Task 6 |
| §4.3 provenance carries recipe + prompt | Tasks 4, 5 |
| §5 MCP injection | Task 7 |
| §6 mocked SDK, replay, style errors, budget, live smoke | Tasks 1-5, 7 |
| §6 regression pin on the `editor-mcp-server` fixture | Task 8 |
| §7 gap log · §8 exit criteria · §10 docs | Task 8 |
| §9 risk: silent recipe unrepresentable | Task 1 (schema), Task 2 (test) |

**Deliberate deviations from the spec, recorded here:**

- Spec §3.1 describes SFX decay as "decay"; the renderer implements it as a **linear** amplitude ramp to the `decay` fraction rather than the multiplicative per-sample decay the old `renderSfx` used. Multiplicative decay compounds floating-point rounding over up to 22 050 samples; a linear ramp is bit-stable and needs no `Math.exp`. Fold this into the spec on ship.
- The spec says the renderer "reuses the existing `osc()`". `osc` is a module-private function in `audioProvider.ts`, so Task 2 **moves** it into `audioRecipe.ts` rather than importing it. Same code, new home; `audioProvider.ts` no longer defines it.
- Task 6 is a test-only task whose test passes on the first run. That is intentional and called out in its Step 2 — it converts an undocumented dependency into a guarded contract. A reviewer who expects red-then-green should read that step before flagging it.

**Placeholder scan:** none. Every code step carries complete, runnable code. Four steps defer to a neighbouring file for an exact shape — Task 4 Step 1 (`ProviderContext` fixture), Task 6 Step 1 (style fixture), Task 7 Step 1 (`namedProviders` accessor), Task 8 Step 1 (fixture-spec location, with the grep to find it) — and each names what to copy and what to do if it differs.

**Command audit:** every command uses `npx vitest run --project <directory-name>`, verified against this repo. `asset-providers`, `asset-providers-ai`, and `editor-mcp-server` declare no `test` script, so `npm test -w` is never used. Root gates are `npm run ci` and `npm run coverage`.

**Type consistency:** `SfxRecipe`, `MusicRecipe`, `AudioRecipe`, `sfxRecipeSchema`, `musicRecipeSchema`, `semitoneRatio`, `SEMITONE_RATIOS` are defined in Task 1 and used unchanged in Tasks 2-6. `AUDIO_SAMPLE_RATE` and `renderAudioRecipe(recipe): Int16Array` come from Task 2 and are called identically in Tasks 4, 5, 6. `audioRecipeStyleErrors(recipe, style): string[]` and `TEMPO_STEP_SECONDS` come from Task 3 and have the same signature in Tasks 4, 5, 7. `createClaudeAudioProvider({ client?, model? })` matches the `claude-svg`/`claude-prop` option shape. The provider `id` `'claude-audio'`, `kinds: ['audio', 'music']`, and `fileExtension` `'wav'` are consistent across Tasks 5, 7, 8.

**Audit note (2026-08-01):** an earlier draft claimed `z.discriminatedUnion` cannot accept a `superRefine` wrapper, and added a workaround. That was verified false against this repo's zod v4 — a refined member both constructs and runs its refinements through the union — so `audioRecipeSchema` now unions `musicRecipeSchema` directly. Task 5 still parses with the specific schema per kind, which is about giving a precise error message, not about refinements running.

**Ordering:** Tasks 1→2→3 are strictly sequential (each appends to the same module). Task 4 and Task 5 both depend on 1-3 but not on each other. Task 6 depends on 2. Task 7 depends on 5. Task 8 is last.
