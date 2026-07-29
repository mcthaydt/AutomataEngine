import { describe, expect, it } from 'vitest'
import { propRecipePaletteErrors, type PropRecipe } from '../src/propRecipe'

const recipe = (color: string): PropRecipe => ({
  formatVersion: 1,
  parts: [{ primitive: 'box', size: { x: 1, y: 1, z: 1 }, offset: { x: 0, y: 0.5, z: 0 }, color }]
})

describe('propRecipePaletteErrors', () => {
  it('is empty when every part color is in the allowed palette', () => {
    expect(propRecipePaletteErrors(recipe('hsl(200 50% 50%)'), ['hsl(200 50% 50%)'])).toEqual([])
  })

  it('reports one message per off-palette part color', () => {
    const errors = propRecipePaletteErrors(recipe('#ff0000'), ['hsl(200 50% 50%)'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#ff0000')
  })
})
