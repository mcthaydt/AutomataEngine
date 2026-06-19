import { describe, expect, it } from 'vitest'
import { initialMode, modeReducer } from '../../src/state/mode'
import { initialSelection, selectionReducer } from '../../src/state/selection'
import { initialTool, toolReducer } from '../../src/state/tool'

describe('selection slice', () => {
  it('replaces the selection', () => {
    expect(selectionReducer(initialSelection, { type: 'select', ids: ['a', 'b'] })).toEqual(['a', 'b'])
  })

  it('clears selection when items are deleted', () => {
    const after = selectionReducer(['a', 'b'], { type: 'command', command: { type: 'deleteItems', ids: ['a'] } })
    expect(after).toEqual(['b'])
  })
})

describe('tool slice', () => {
  it('sets the active tool and surface brush', () => {
    let tool = toolReducer(initialTool, { type: 'setTool', tool: { brushId: 'box', mode: 'place' } })
    expect(tool.selection).toEqual({ brushId: 'box', mode: 'place' })
    tool = toolReducer(tool, { type: 'setSurfaceBrush', surface: { kind: 'color', value: '#000' } })
    expect(tool.surface).toEqual({ kind: 'color', value: '#000' })
  })
})

describe('mode slice', () => {
  it('toggles edit/play', () => {
    expect(modeReducer(initialMode, { type: 'setMode', mode: 'play' })).toBe('play')
  })
})
