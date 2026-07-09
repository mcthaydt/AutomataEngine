import type { EditorProjectToolHost } from '@automata/editor/headless'
import { projectFileDocuments, writeProjectFiles, type ProjectFileWriter } from '@automata/project'

/** A writer that can also prune files no longer in the snapshot (e.g. the Node directory writer). */
type PruningWriter = ProjectFileWriter & { removeStale(keepPaths: readonly string[]): Promise<void> }

function canPrune(writer: ProjectFileWriter): writer is PruningWriter {
  return typeof (writer as Partial<PruningWriter>).removeStale === 'function'
}

/**
 * Wrap a project tool host so any command that mutates the snapshot
 * (result content `{ changed: true }`) is flushed to disk in canonical form.
 * Reads and no-op writes pass through untouched. After a changing flush, files
 * for scenes/resources no longer in the snapshot are pruned so disk stays
 * authoritative (when the writer supports pruning).
 */
export function createWriteThroughHost(
  inner: EditorProjectToolHost,
  writer: ProjectFileWriter
): EditorProjectToolHost {
  return {
    get snapshot() { return inner.snapshot },
    get commands() { return inner.commands },
    listTools: () => inner.listTools(),
    readResource: (uri) => inner.readResource(uri),
    async executeTool(name, args) {
      const result = await inner.executeTool(name, args)
      const changed = result.ok && (result.content as { changed?: unknown } | null)?.changed === true
      if (changed) {
        await writeProjectFiles(writer, inner.snapshot)
        if (canPrune(writer)) {
          await writer.removeStale(projectFileDocuments(inner.snapshot).map((doc) => doc.path))
        }
      }
      return result
    }
  }
}
