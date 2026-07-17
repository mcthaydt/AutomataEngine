import type { AssetKind } from '@automata/contracts'
import { propRecipeSchema } from './propRecipe'
import { readWavInfo } from './validateMedia'

/** A recorded optimization result, omitted entirely when the input is canonical. */
export interface OptimizationResult {
  bytes: Uint8Array
  transformation: { tool: string; toolVersion: string; params: Record<string, unknown> }
}

/** Fixed headroom target: below the validation peak ceiling and fully deterministic. */
export const WAV_NORMALIZE_PEAK = 29_491

const TOOL_VERSION = '1.0.0'

function optimizeSvg(bytes: Uint8Array): OptimizationResult | null {
  const text = new TextDecoder().decode(bytes)
  const minified = `${text.replace(/>\s+</g, '><').trim()}\n`
  if (minified === text) return null
  return {
    bytes: new TextEncoder().encode(minified),
    transformation: { tool: 'svg-minify', toolVersion: TOOL_VERSION, params: {} }
  }
}

function optimizeProp(bytes: Uint8Array): OptimizationResult | null {
  const text = new TextDecoder().decode(bytes)
  const canonical = `${JSON.stringify(propRecipeSchema.parse(JSON.parse(text)), null, 2)}\n`
  if (canonical === text) return null
  return {
    bytes: new TextEncoder().encode(canonical),
    transformation: { tool: 'prop-canonicalize', toolVersion: TOOL_VERSION, params: {} }
  }
}

function optimizeWav(bytes: Uint8Array): OptimizationResult | null {
  const info = readWavInfo(bytes)
  if (info.peak === 0 || info.peak === WAV_NORMALIZE_PEAK) return null
  const out = new Uint8Array(bytes)
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  let offset = 12
  let dataStart = -1
  while (offset + 8 <= out.length) {
    const id = String.fromCharCode(...out.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    if (id === 'data') {
      dataStart = offset + 8
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataStart < 0) throw new Error('missing data chunk')
  for (let index = 0; index < info.sampleCount; index += 1) {
    const at = dataStart + index * 2
    const sample = view.getInt16(at, true)
    view.setInt16(at, Math.trunc((sample * WAV_NORMALIZE_PEAK) / info.peak), true)
  }
  return {
    bytes: out,
    transformation: {
      tool: 'wav-normalize',
      toolVersion: TOOL_VERSION,
      params: { peakBefore: info.peak, peakAfter: WAV_NORMALIZE_PEAK }
    }
  }
}

/** Optimize one supported media format; repeated calls are byte-level no-ops. */
export function optimizeAssetBytes(kind: AssetKind, bytes: Uint8Array): OptimizationResult | null {
  if (kind === 'ui' || kind === 'texture') return optimizeSvg(bytes)
  if (kind === 'model') return optimizeProp(bytes)
  return optimizeWav(bytes)
}
