import { describe, expect, it } from 'vitest'
import { renderSkeleton } from '../src/skeleton'

describe('walking skeleton', () => {
  it('renders the engine version into the root element', () => {
    const root = document.createElement('div')
    renderSkeleton(root)
    expect(root.textContent).toContain('AutomataEngine 0.1.0')
  })
})
