import type { AcceptanceCriterion } from './gameSpec'

/** Evidence assembled from the session ledger for the vertical-slice checkpoint. */
export type SliceGateKind = 'build' | 'test' | 'browser' | 'evaluate' | 'asset'
export type SliceGateStatus = 'passed' | 'failed' | 'missing' | 'stale'

export interface SliceGateResult {
  kind: SliceGateKind
  status: SliceGateStatus
  stepId?: string
}

export interface SliceEvidence {
  gameId: string
  specVersion: number
  specHash: string
  compositionHash: string
  seed: number
  packIds: string[]
  contentHash: string
  gates: SliceGateResult[]
  acceptance: AcceptanceCriterion[]
  evalMetrics: Record<string, number | string | boolean> | null
  howToPlay: { devCommand: string; url: string; controls: string }
}
