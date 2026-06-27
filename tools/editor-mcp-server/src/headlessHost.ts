import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseData } from '@automata/engine/data'
import { createEditorToolHost, type EditorToolHost, type GameDefinition } from '@automata/editor/headless'
import {
  archetypeLibraryKind,
  createHeadlessMonkeyBallDefinition,
  physicsTuningKind,
  toPhysicsTuning,
  type Level
} from 'monkey-ball/headless'

/** src → up three → repo root → monkey-ball's shipped data. */
const DEFAULT_DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../games/monkey-ball/public/data')

export interface HeadlessHostOptions {
  /** Directory containing `archetypes/` and `config/`; defaults to monkey-ball's shipped data. */
  dataDir?: string
  /** Initial level as JSON text; defaults to the empty doc. */
  levelJson?: string
}

export interface HeadlessHost {
  host: EditorToolHost<Level>
  definition: GameDefinition<Level>
}

export async function createHeadlessHost(opts: HeadlessHostOptions = {}): Promise<HeadlessHost> {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR
  const read = (rel: string): string => readFileSync(resolve(dataDir, rel), 'utf8')

  const lib = parseData(archetypeLibraryKind, read('archetypes/standard.yaml'), 'standard.yaml')
  const tuning = toPhysicsTuning(parseData(physicsTuningKind, read('config/physics.toml'), 'physics.toml'))
  const definition = createHeadlessMonkeyBallDefinition(lib, tuning)

  const initialDoc = opts.levelJson
    ? definition.scene.parse(JSON.parse(opts.levelJson))
    : definition.scene.emptyDoc()

  const host = createEditorToolHost<Level>({ definition, initialDoc })
  return { host, definition }
}
