import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { projectFileDocuments, type ProjectSnapshot } from '@automata/project'

/** Write-through snapshots so successful authoring survives server resets. */
export async function writeProjectFiles(projectDir: string, snapshot: ProjectSnapshot): Promise<void> {
  for (const document of projectFileDocuments(snapshot)) {
    const path = join(projectDir, document.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, document.text)
  }
}
