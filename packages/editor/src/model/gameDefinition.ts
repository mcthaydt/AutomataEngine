import type { PhysicsPort, RenderPort, World } from '@automata/engine'
import type { HeadlessOpts, TestPlayResult } from '@automata/contracts'
import type { Brush, Field, SceneCommand, SceneItem, Surface } from './types'

export type { HeadlessOpts, TestPlayResult, PlayObservation } from '@automata/contracts'

/** Thrown by SceneModel.apply when a command cannot be applied. */
export class CommandError extends Error {}

/** The game's adapter over its opaque, schema-validated document. */
export interface SceneModel<Doc> {
  /** Parses unknown input into a valid Doc or throws. */
  parse(input: unknown): Doc
  emptyDoc(): Doc
  /** All placeable items: geometry, archetypes, and synthesized markers. */
  listItems(doc: Doc): SceneItem[]
  /** Pure: returns a new Doc, or throws CommandError. */
  apply(doc: Doc, cmd: SceneCommand): Doc
  /** Scalar metadata fields for the inspector form. */
  metadataFields(doc: Doc): Field[]
  getSurface(doc: Doc, id: string): Surface
}

/** Live in-viewport gameplay handle. */
export interface PlayHandle {
  fixedUpdate(dt: number): void
  render(alpha: number, frameDt?: number): void
  dispose(): void
}

/** Optional test-play members; present from M13 onward. */
export interface PlayDefinition<Doc> {
  createGameplay?(doc: Doc, render: RenderPort, physics: PhysicsPort): PlayHandle
  runHeadlessPlay(doc: Doc, opts: HeadlessOpts): Promise<TestPlayResult>
}

export interface GameDefinition<Doc> {
  id: string
  scene: SceneModel<Doc>
  palette: { geometry: Brush[]; archetypes: Brush[]; markers: Brush[] }
  /** What the "change surface" tool cycles through. */
  surfacePalette: Surface[]
  buildWorld(doc: Doc, render: RenderPort, physics: PhysicsPort): World<object>
  /** Incrementally reconcile an already-built editor world when supported. */
  syncWorld?(world: World<object>, previous: Doc, next: Doc): void
  /** Maps a Surface to how it paints; throws on unsupported kinds. */
  resolveSurface(s: Surface): { color: string }
  /** Test-play; added in M13. The play controller requires this. */
  play?: PlayDefinition<Doc>
}
