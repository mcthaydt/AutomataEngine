import { describe, expect, it } from 'vitest'
import type { SliceEvidence } from '@automata/contracts'
import { renderSliceReport } from '../src'

const evidence: SliceEvidence = {
  gameId: 'first-light', specVersion: 1, specHash: 'spec-hash', compositionHash: 'comp-hash',
  seed: 7, packIds: ['interaction-inventory'], contentHash: 'content-hash',
  gates: [
    { kind: 'build', status: 'passed', stepId: 'step-0003' },
    { kind: 'test', status: 'passed', stepId: 'step-0004' },
    { kind: 'browser', status: 'failed', stepId: 'step-0005' },
    { kind: 'evaluate', status: 'missing' }
  ],
  acceptance: [
    { id: 'a-sim', description: 'Critical path completes.', kind: 'simulation', target: 'evaluate:critical-path' },
    { id: 'a-manual', description: 'A human approves the slice.', kind: 'manual', target: 'checkpoint:slice' }
  ],
  evalMetrics: { objectivesComplete: true, elapsedS: 4.2 },
  howToPlay: { devCommand: 'npm run dev -w first-light', url: 'http://127.0.0.1:5178/', controls: 'WASD/arrows: move' }
}

describe('renderSliceReport', () => {
  it('renders a deterministic markdown report carrying hashes, gates, acceptance, and how-to-play', () => {
    const markdown = renderSliceReport(evidence)
    expect(renderSliceReport(evidence)).toBe(markdown)
    expect(markdown).toContain('# Vertical-slice report — first-light')
    expect(markdown).toContain('spec-hash')
    expect(markdown).toContain('comp-hash')
    expect(markdown).toContain('content-hash')
    expect(markdown).toContain('| browser | failed | step-0005 |')
    expect(markdown).toContain('| evaluate | missing | — |')
    expect(markdown).toContain('`evaluate:critical-path` — covered by check:evaluate')
    expect(markdown).toContain('covered by this checkpoint')
    expect(markdown).toContain('npm run dev -w first-light')
    expect(markdown).toContain('objectivesComplete: true')
  })

  it('labels an empty pack set and unknown acceptance coverage explicitly', () => {
    const markdown = renderSliceReport({
      ...evidence,
      packIds: [],
      acceptance: [{
        id: 'a-future', description: 'A future evaluator covers this.',
        kind: 'future' as never, target: 'future:gate'
      }]
    })
    expect(markdown).toContain('- packs: none')
    expect(markdown).toContain('covered by unknown')
  })
})
