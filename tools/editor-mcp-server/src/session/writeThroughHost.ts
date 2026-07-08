import type { EditorProjectToolHost } from '@automata/editor/headless'
import { writeProjectFiles, type ProjectFileWriter } from '@automata/project'

/**
 * Wrap a project tool host so any command that mutates the snapshot
 * (result content `{ changed: true }`) is flushed to disk in canonical form.
 * Reads and no-op writes pass through untouched.
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
      if (changed) await writeProjectFiles(writer, inner.snapshot)
      return result
    }
  }
}
