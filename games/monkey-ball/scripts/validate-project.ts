import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadProjectFiles, validateProject } from '@automata/project'
import { monkeyBallProjectDefinition } from '../src/project/definition'

/** Build-time gate for the shipped project folder. */
const root = resolve(import.meta.dirname, '../public/project')
const { snapshot } = await loadProjectFiles({ readText: (path) => readFile(resolve(root, path), 'utf8') })
const errors = validateProject(monkeyBallProjectDefinition, snapshot).filter((issue) => issue.severity === 'error')

if (errors.length > 0) {
  for (const issue of errors) process.stderr.write(`${issue.code} ${issue.pointer ?? ''} ${issue.message}\n`)
  process.exit(1)
}

monkeyBallProjectDefinition.compile(snapshot)
process.stdout.write('monkey-ball project OK\n')
