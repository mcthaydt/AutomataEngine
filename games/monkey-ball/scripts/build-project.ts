import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseData } from '@automata/engine'
import { projectFileDocuments } from '@automata/project'
import { physicsTuningKind, toPhysicsTuning } from '../src/project/legacyTypes'
import { levelKind, worldsManifestKind, type Level } from '../src/project/legacyTypes'
import { importLegacyMonkeyBallProject } from '../src/project/legacyImporter'

/**
 * Deterministically migrate the retained legacy content tree to project files.
 * Explicit source/output flags keep the generator useful after legacy public
 * data moves to test fixtures in the cleanup phase.
 */
const source = resolve(readOption('--source') ?? 'games/monkey-ball/tests/fixtures/legacy')
const output = resolve(readOption('--out') ?? 'games/monkey-ball/public/project')

const readSource = (path: string): Promise<string> => readFile(resolve(source, path), 'utf8')
const rawTuning = parseData(physicsTuningKind, await readSource('config/physics.toml'), 'physics.toml')
const manifest = parseData(worldsManifestKind, await readSource('levels/worlds.json'), 'worlds.json')
const levels: Record<string, Level> = {}
for (const id of manifest.worlds.flatMap((world) => world.levels)) {
  levels[id] = parseData(levelKind, await readSource(`levels/${id}.json`), `${id}.json`)
}

const snapshot = importLegacyMonkeyBallProject({ tuning: toPhysicsTuning(rawTuning), manifest, levels })
for (const document of projectFileDocuments(snapshot)) {
  const target = resolve(output, document.path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, document.text, 'utf8')
}

process.stdout.write(`wrote ${projectFileDocuments(snapshot).length} Monkey Ball project files to ${output}\n`)

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`)
  return value
}
