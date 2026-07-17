import type { AssetIssue, AssetManifestEntry, StyleParams } from '@automata/contracts'
import { propRecipeSchema, recipeToRenderables } from './propRecipe'
import { svgPaletteColors } from './svgProvider'

/** Stable byte and playback limits for assets that can reach a release gate. */
export const MEDIA_BUDGETS = {
  svgMaxBytes: 32_768,
  propMaxBytes: 16_384,
  wavMaxBytes: 400_000,
  sfxMaxSeconds: 1,
  ambienceMaxSeconds: 8,
  wavPeakMax: 32_000
} as const

export interface WavInfo {
  audioFormat: number
  sampleRate: number
  channels: number
  bitsPerSample: number
  sampleCount: number
  peak: number
}

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length))

/** Read the pipeline's PCM WAV variant, rejecting malformed RIFF/fmt/data input. */
export function readWavInfo(bytes: Uint8Array): WavInfo {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let fmt: { audioFormat: number; sampleRate: number; channels: number; bitsPerSample: number } | null = null
  let data: { start: number; length: number } | null = null
  while (offset + 8 <= bytes.length) {
    const chunkId = ascii(bytes, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const body = offset + 8
    const next = body + chunkSize + (chunkSize % 2)
    if (next > bytes.length) throw new Error(`truncated ${chunkId} chunk`)
    if (chunkId === 'fmt ') {
      if (chunkSize < 16) throw new Error('truncated fmt chunk')
      fmt = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true)
      }
    } else if (chunkId === 'data') {
      data = { start: body, length: chunkSize }
    }
    offset = next
  }
  if (!fmt || !data || data.length % 2 !== 0) throw new Error('missing or malformed fmt/data chunk')
  const sampleCount = data.length / 2
  let peak = 0
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.abs(view.getInt16(data.start + index * 2, true))
    if (sample > peak) peak = sample
  }
  return { ...fmt, sampleCount, peak }
}

const issueFor = (entry: AssetManifestEntry, code: AssetIssue['code'], message: string): AssetIssue => ({
  severity: 'error', code, assetId: entry.id, message
})

const SVG_COLOR_ATTR = /(?:fill|stroke)="([^"]+)"/g

/** Minimal well-formedness check for the provider's element-only SVG subset. */
function isWellFormedSvg(text: string): boolean {
  const stack: string[] = []
  for (const match of text.matchAll(/<\/?([A-Za-z][\w:.-]*)(?:\s[^<>]*)?\/?>/g)) {
    const tag = match[0]!
    const name = match[1]!
    if (tag.startsWith('</')) {
      if (stack.pop() !== name) return false
    } else if (!tag.endsWith('/>')) {
      stack.push(name)
    }
  }
  return stack.length === 0
}

/**
 * Validate media bytes after structural manifest validation. The result is
 * deliberately pure: callers own persistence, status transitions, and gates.
 */
export function validateAssetMedia(
  entry: AssetManifestEntry,
  bytes: Uint8Array,
  style: StyleParams
): AssetIssue[] {
  const issues: AssetIssue[] = []
  const invalid = (message: string): void => { issues.push(issueFor(entry, 'asset-media-invalid', message)) }
  const budget = (message: string): void => { issues.push(issueFor(entry, 'asset-media-budget', message)) }
  const { kind } = entry.requirement

  if (kind === 'ui' || kind === 'texture') {
    if (bytes.length > MEDIA_BUDGETS.svgMaxBytes) {
      budget(`SVG "${entry.id}" is ${bytes.length} bytes (max ${MEDIA_BUDGETS.svgMaxBytes})`)
    }
    const text = new TextDecoder().decode(bytes)
    if (!text.trimStart().startsWith('<svg') || !isWellFormedSvg(text)) {
      invalid(`SVG "${entry.id}" does not parse as an <svg> document`)
      return issues
    }
    const allowed = new Set(svgPaletteColors(style))
    for (const match of text.matchAll(SVG_COLOR_ATTR)) {
      const color = match[1]!
      if (color !== 'none' && !color.startsWith('url(') && !allowed.has(color)) {
        invalid(`SVG "${entry.id}" uses off-palette color "${color}"`)
      }
    }
    return issues
  }

  if (kind === 'model') {
    if (bytes.length > MEDIA_BUDGETS.propMaxBytes) {
      budget(`Prop recipe "${entry.id}" is ${bytes.length} bytes (max ${MEDIA_BUDGETS.propMaxBytes})`)
    }
    try {
      recipeToRenderables(propRecipeSchema.parse(JSON.parse(new TextDecoder().decode(bytes))))
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      invalid(`Prop recipe "${entry.id}" invalid: ${detail}`.slice(0, 400))
    }
    return issues
  }

  if (bytes.length > MEDIA_BUDGETS.wavMaxBytes) {
    budget(`WAV "${entry.id}" is ${bytes.length} bytes (max ${MEDIA_BUDGETS.wavMaxBytes})`)
  }
  let info: WavInfo
  try {
    info = readWavInfo(bytes)
  } catch (error) {
    invalid(`WAV "${entry.id}" invalid: ${error instanceof Error ? error.message : String(error)}`)
    return issues
  }
  if (info.audioFormat !== 1 || info.sampleRate !== 22_050 || info.channels !== 1 || info.bitsPerSample !== 16) {
    invalid(`WAV "${entry.id}" must be 22050 Hz mono 16-bit (got ${info.sampleRate} Hz, ${info.channels}ch, ${info.bitsPerSample}-bit)`)
  }
  const seconds = info.sampleCount / info.sampleRate
  const maxSeconds = kind === 'audio' ? MEDIA_BUDGETS.sfxMaxSeconds : MEDIA_BUDGETS.ambienceMaxSeconds
  if (seconds > maxSeconds) budget(`WAV "${entry.id}" is ${seconds.toFixed(2)}s (max ${maxSeconds}s for ${kind})`)
  if (info.peak > MEDIA_BUDGETS.wavPeakMax) budget(`WAV "${entry.id}" peak ${info.peak} exceeds ${MEDIA_BUDGETS.wavPeakMax}`)
  return issues
}
