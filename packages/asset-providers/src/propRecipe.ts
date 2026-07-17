import type { RenderableDef } from '@automata/engine'
import { z } from '@automata/project'

/**
 * Prop recipe v1: engine primitives with local offsets. This remains the
 * model asset format until the engine gains a mesh-loader boundary.
 */
const vec3Schema = z.strictObject({ x: z.number(), y: z.number(), z: z.number() })
const colorSchema = z.string().min(1).max(40)

const partSchema = z.discriminatedUnion('primitive', [
  z.strictObject({
    primitive: z.literal('box'),
    size: vec3Schema,
    offset: vec3Schema,
    color: colorSchema
  }),
  z.strictObject({
    primitive: z.literal('sphere'),
    radius: z.number().positive(),
    offset: vec3Schema,
    color: colorSchema
  }),
  z.strictObject({
    primitive: z.literal('cylinder'),
    radius: z.number().positive(),
    height: z.number().positive(),
    offset: vec3Schema,
    color: colorSchema
  })
])

export const propRecipeSchema = z.strictObject({
  formatVersion: z.literal(1),
  parts: z.array(partSchema).min(1).max(12)
})
export type PropRecipe = z.infer<typeof propRecipeSchema>

/** Map a recipe to render definitions while preserving each part's local pose. */
export function recipeToRenderables(
  recipe: PropRecipe
): Array<{ def: RenderableDef; offset: { x: number; y: number; z: number } }> {
  return recipe.parts.map((part) => {
    if (part.primitive === 'box') {
      return {
        def: { primitive: 'box', size: part.size, color: part.color },
        offset: part.offset
      }
    }
    if (part.primitive === 'sphere') {
      return {
        def: { primitive: 'sphere', radius: part.radius, color: part.color },
        offset: part.offset
      }
    }
    return {
      def: {
        primitive: 'cylinder',
        radius: part.radius,
        height: part.height,
        color: part.color
      },
      offset: part.offset
    }
  })
}
