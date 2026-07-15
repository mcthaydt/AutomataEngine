import type { SliceEvidence } from '@automata/contracts'

const COVERAGE: Record<string, string> = {
  structural: 'spec:compile',
  simulation: 'check:evaluate',
  browser: 'check:browser',
  manual: 'this checkpoint'
}

/** Deterministic markdown evidence report for the vertical-slice checkpoint. */
export function renderSliceReport(evidence: SliceEvidence): string {
  const lines: string[] = []
  lines.push(`# Vertical-slice report — ${evidence.gameId}`)
  lines.push('')
  lines.push(`- specVersion: ${evidence.specVersion} (\`${evidence.specHash}\`)`)
  lines.push(`- composition: \`${evidence.compositionHash}\` (seed ${evidence.seed})`)
  lines.push(`- content: \`${evidence.contentHash}\``)
  lines.push(`- packs: ${evidence.packIds.join(', ') || 'none'}`)
  lines.push('')
  lines.push('## Gates')
  lines.push('')
  lines.push('| gate | status | step |')
  lines.push('|---|---|---|')
  for (const gate of evidence.gates) lines.push(`| ${gate.kind} | ${gate.status} | ${gate.stepId ?? '—'} |`)
  lines.push('')
  lines.push('## Acceptance criteria')
  lines.push('')
  for (const criterion of evidence.acceptance) {
    const coverage = COVERAGE[criterion.kind] ?? 'unknown'
    lines.push(`- **${criterion.id}** (${criterion.kind}): ${criterion.description} \`${criterion.target}\` — covered by ${coverage}`)
  }
  lines.push('')
  lines.push('## Evaluation metrics')
  lines.push('')
  if (evidence.evalMetrics === null) lines.push('- none recorded')
  else for (const [key, value] of Object.entries(evidence.evalMetrics)) lines.push(`- ${key}: ${value}`)
  lines.push('')
  lines.push('## How to play')
  lines.push('')
  lines.push(`- \`${evidence.howToPlay.devCommand}\` then open ${evidence.howToPlay.url}`)
  lines.push(`- ${evidence.howToPlay.controls}`)
  lines.push('')
  return lines.join('\n')
}
