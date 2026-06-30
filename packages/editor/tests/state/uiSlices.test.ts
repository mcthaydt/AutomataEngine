import { describe, expect, it } from 'vitest'
import { initialTool, toolReducer } from '../../src/state/tool'

describe('tool slice', () => {
  it('sets the active project prefab', () => {
    const tool = toolReducer(initialTool, {
      type: 'setTool', tool: { prefabId: 'box', mode: 'place' }
    })
    expect(tool.selection).toEqual({ prefabId: 'box', mode: 'place' })
  })

  it('ignores unrelated project actions', () => {
    expect(toolReducer(initialTool, { type: 'undo' })).toBe(initialTool)
  })
})
