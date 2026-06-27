import { describe, expect, it } from 'vitest'
import { button, panel, staticView } from '../../src/ui/dom'

describe('dom helpers', () => {
  it('panel carries the overlay class plus its own', () => {
    expect(panel('title').className).toBe('overlay title')
  })

  it('button renders a label, class, and wires its click handler', () => {
    let clicks = 0
    const b = button('Start', 'start', () => { clicks++ })
    expect(b.textContent).toBe('Start')
    expect(b.className).toBe('start')
    b.click()
    expect(clicks).toBe(1)
  })

  it('staticView detaches its element on dispose', () => {
    const el = panel('x')
    document.body.append(el)
    const view = staticView(el)
    expect(el.isConnected).toBe(true)
    view.dispose()
    expect(el.isConnected).toBe(false)
  })
})
