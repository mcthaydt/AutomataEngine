import { describe, expect, it } from 'vitest'
import { renderSkeleton } from '../src/skeleton'

describe('editor walking skeleton', () => {
  it('renders the engine version into the root element', () => {
    const root = document.createElement('div')
    renderSkeleton(root)
    expect(root.textContent).toContain('level-editor on AutomataEngine 0.1.0')
  })
})
