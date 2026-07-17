import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadProjectFiles, validateProject } from '@automata/project'
import { projectDefinition } from '../src/project/definition'

/**
 * Build-time gate: load the shipped public project, validate and compile it,
 * print structured errors to stderr, and exit non-zero on any error.
 */
const root = resolve(import.meta.dirname, '../public/project')
const { snapshot } = await loadProjectFiles({ readText: (path) => readFile(resolve(root, path), 'utf8') })

const errors = validateProject(projectDefinition, snapshot).filter((issue) => issue.severity === 'error')
if (errors.length > 0) {
  for (const issue of errors) process.stderr.write(`${issue.code} ${issue.pointer ?? ''} ${issue.message}\n`)
  process.exit(1)
}

projectDefinition.compile(snapshot)
process.stdout.write('first-light project OK\n')
