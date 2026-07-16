import type { RenderPort } from '@automata/engine'

/**
 * Editor-contribution seam (pack contract v2, deliberately thin per the 80/20
 * editor rule): prefab entity templates plus enough preview to SEE a pack's
 * composed entities. Typed here so packs never depend on @automata/editor;
 * PackPrefabTemplate is structurally compatible with the editor's
 * PrefabRegistration.
 */
export interface PackPreviewHandle {
  render?(alpha: number): void
  dispose(): void
}

export interface PackPrefabTemplate {
  id: string
  label: string
  components: Array<{ typeId: string; data: Record<string, unknown> }>
}

export interface PackEditorContribution {
  packId: string
  prefabs: PackPrefabTemplate[]
  /** Draw the pack's composed entities into an existing preview render port. */
  createPreview?(config: unknown, render: RenderPort): PackPreviewHandle
}
