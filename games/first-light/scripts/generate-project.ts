import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createTemplate } from '../src/project/template'

/** Regenerate public/project from the in-code template — the sanctioned edit path. */
const root = resolve(import.meta.dirname, '../public/project')
const snapshot = createTemplate()

const files: Array<[string, unknown]> = [['automata.project.json', snapshot.manifest]]
for (const scene of snapshot.manifest.scenes) files.push([scene.path, snapshot.scenes[scene.id]])
for (const resource of snapshot.manifest.resources) files.push([resource.path, snapshot.resources[resource.id]])

for (const [path, value] of files) {
  const target = resolve(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`)
}
process.stdout.write(`${files.length} project files written\n`)
