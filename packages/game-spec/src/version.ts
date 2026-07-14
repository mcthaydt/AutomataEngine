import type { GameSpec, GameSpecDraft, SpecTranslation } from '@automata/contracts'
import type { SpecIssue } from './validate'

export interface NextSpecVersionArgs {
  current: GameSpec | null
  currentApproved: boolean
  draft: GameSpecDraft
  prompt: string
  translations: SpecTranslation[]
  changeReason?: string
}

export type NextSpecVersionResult = { ok: true; spec: GameSpec } | { ok: false; issue: SpecIssue }

/** An approved version never mutates: post-approval changes create an attributable next version. */
export function nextSpecVersion(args: NextSpecVersionArgs): NextSpecVersionResult {
  const { current, currentApproved, draft, prompt, translations, changeReason } = args
  if (current === null) {
    return { ok: true, spec: { specVersion: 1, provenance: { prompt, translations, history: [{ version: 1, reason: 'initial compile' }] }, ...draft } }
  }
  if (!currentApproved) {
    return { ok: true, spec: { specVersion: current.specVersion, provenance: { prompt, translations, history: current.provenance.history }, ...draft } }
  }
  if (!changeReason) {
    return { ok: false, issue: { severity: 'error', code: 'spec-approved-immutable', path: 'changeReason', message: `specVersion ${current.specVersion} is approved and immutable; pass changeReason to create version ${current.specVersion + 1}` } }
  }
  const version = current.specVersion + 1
  return { ok: true, spec: { specVersion: version, provenance: { prompt, translations, history: [...current.provenance.history, { version, reason: changeReason }] }, ...draft } }
}
