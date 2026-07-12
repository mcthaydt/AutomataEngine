import { buildProjectSnapshot, projectFilesFromSnapshot } from './templates/projectData.ts'
import * as config from './templates/configFiles.ts'
import * as project from './templates/projectFiles.ts'
import * as src from './templates/srcFiles.ts'
import * as tests from './templates/testFiles.ts'

export interface ScaffoldFile { path: string; content: string }
export interface ScaffoldPlan { name: string; label: string; port: number; files: ScaffoldFile[] }

export interface PlanOptions {
  /** Explicit dev port; must not collide with `existingPorts`. */
  port?: number
  /** `automata.devPort` values already taken; drives auto-assignment. */
  existingPorts?: readonly number[]
}

/** 'beacon-run' -> 'Beacon Run'. */
export function titleCase(slug: string): string {
  return slug.split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ')
}

/**
 * Plans a complete registered game: deterministic sim, render wiring, project
 * definition + template, registry loader entries, passing tests, e2e smoke,
 * and the authored `public/project` files. Pure — no filesystem access.
 */
export function planNewGame(name: string, options: PlanOptions = {}): ScaffoldPlan {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('Game name must be a lowercase alphanumeric slug with optional hyphens')
  }
  const existingPorts = options.existingPorts ?? []
  const port = options.port ?? Math.max(5177, ...existingPorts) + 1
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Port must be an integer from 1 through 65535')
  }
  if (existingPorts.includes(port)) {
    throw new Error(`Port ${port} is already used by another workspace`)
  }

  const label = titleCase(name)
  const snapshot = buildProjectSnapshot(name, label)
  const dir = `games/${name}`
  const at = (path: string, content: string): ScaffoldFile => ({ path: `${dir}/${path}`, content })

  const files: ScaffoldFile[] = [
    at('package.json', config.packageJson(name, port)),
    at('tsconfig.json', config.tsconfigJson()),
    at('vite.config.ts', config.viteConfigTs()),
    at('vitest.config.ts', config.vitestConfigTs(name)),
    at('index.html', config.indexHtml(label)),
    at('README.md', config.readmeMd(name, label, port)),
    at('src/index.ts', src.indexTs()),
    at('src/vite-env.d.ts', src.viteEnvDts()),
    at('src/main.ts', src.mainTs()),
    at('src/sim/sim.ts', src.simTs()),
    at('src/game/gameplay.ts', src.gameplayTs()),
    at('src/project/types.ts', project.typesTs(name)),
    at('src/project/template.ts', project.templateTs(JSON.stringify(snapshot, null, 2))),
    at('src/project/compiler.ts', project.compilerTs()),
    at('src/project/definition.ts', project.definitionTs(name, label)),
    at('src/project/evaluation.ts', project.evaluationTs()),
    at('src/project/editor.ts', project.editorTs()),
    at('src/project/index.ts', project.projectIndexTs()),
    at('src/project/load.ts', project.loadTs(name, label)),
    at('scripts/validate-project.ts', src.validateProjectScript(name)),
    at('scripts/generate-project.ts', src.generateProjectScript()),
    at('tests/sim/sim.test.ts', tests.simTest()),
    at('tests/game/gameplay.test.ts', tests.gameplayTest()),
    at('tests/project/definition.test.ts', tests.definitionTest(name)),
    at('tests/project/content.test.ts', tests.contentTest(name, label)),
    at('tests/project/editor.test.ts', tests.editorTest()),
    at('e2e/smoke.spec.ts', tests.e2eSmokeSpec(name, port)),
    ...projectFilesFromSnapshot(snapshot).map((file) => at(file.path, file.content))
  ]
  return { name, label, port, files }
}
