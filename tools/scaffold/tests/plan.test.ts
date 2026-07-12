import { describe, expect, it } from 'vitest'
import { loadProjectFiles, projectSnapshotSchema } from '@automata/project'
import { planNewGame, titleCase } from '../src/plan'
import { buildProjectSnapshot } from '../src/templates/projectData'

describe('planNewGame', () => {
  it('emits a complete registered game inventory', () => {
    const paths = planNewGame('starfall', { port: 5188 }).files.map((file) => file.path)
    expect(paths).toEqual(expect.arrayContaining([
      'games/starfall/package.json',
      'games/starfall/tsconfig.json',
      'games/starfall/vite.config.ts',
      'games/starfall/vitest.config.ts',
      'games/starfall/index.html',
      'games/starfall/README.md',
      'games/starfall/src/main.ts',
      'games/starfall/src/sim/sim.ts',
      'games/starfall/src/game/gameplay.ts',
      'games/starfall/src/project/definition.ts',
      'games/starfall/src/project/template.ts',
      'games/starfall/src/project/editor.ts',
      'games/starfall/src/project/index.ts',
      'games/starfall/scripts/validate-project.ts',
      'games/starfall/scripts/generate-project.ts',
      'games/starfall/tests/sim/sim.test.ts',
      'games/starfall/tests/project/content.test.ts',
      'games/starfall/e2e/smoke.spec.ts',
      'games/starfall/public/project/automata.project.json',
      'games/starfall/public/project/scenes/main.scene.json',
      'games/starfall/public/project/resources/tuning.resource.json'
    ]))
  })

  it('injects the slug and label only into strings, with convention exports', () => {
    const files = planNewGame('beacon-run', { port: 5188 }).files
    const content = (suffix: string): string => files.find((file) => file.path.endsWith(suffix))!.content

    const pkg = JSON.parse(content('package.json')) as {
      name: string
      exports: Record<string, string>
      automata: { devPort: number }
    }
    expect(pkg.name).toBe('beacon-run')
    expect(pkg.exports['./project']).toBe('./src/project/index.ts')
    expect(pkg.exports['./editor']).toBe('./src/project/editor.ts')
    expect(pkg.automata.devPort).toBe(5188)
    expect(content('package.json')).toContain('"@automata/game-kit": "*"')

    const main = content('src/main.ts')
    expect(main).toContain('createGameHost')
    expect(main).toContain('startGameLoop')
    expect(main).not.toContain('new GameLoop')

    expect(content('src/project/definition.ts')).toContain("gameId: 'beacon-run'")
    expect(content('src/project/definition.ts')).toContain("label: 'Beacon Run'")
    expect(content('src/project/types.ts')).toContain("'beacon-run.spawn-point'")
    expect(content('src/project/editor.ts')).toContain('export const loadEditorRegistration')
    expect(content('src/project/index.ts')).toContain('export const loadHeadlessRegistration')
    expect(content('e2e/smoke.spec.ts')).toContain('http://127.0.0.1:5188/')
  })

  it('round-trips the generated public project through the persisted-model schema', async () => {
    const plan = planNewGame('starfall', { port: 5188 })
    const byPath = new Map(plan.files.map((file) => [file.path, file.content]))
    const reader = {
      readText: async (path: string) => {
        const content = byPath.get(`games/starfall/public/project/${path}`)
        if (content === undefined) throw new Error(`missing ${path}`)
        return content
      }
    }
    const { snapshot } = await loadProjectFiles(reader)
    expect(projectSnapshotSchema.parse(snapshot)).toEqual(buildProjectSnapshot('starfall', 'Starfall'))
    const template = byPath.get('games/starfall/src/project/template.ts')!
    expect(template).toContain('"gameId": "starfall"')
  })

  it('auto-assigns the next free port above the existing ones', () => {
    expect(planNewGame('starfall').port).toBe(5178)
    expect(planNewGame('starfall', { existingPorts: [5174, 5177, 5190] }).port).toBe(5191)
  })

  it('rejects an explicit port that another workspace already uses', () => {
    expect(() => planNewGame('starfall', { port: 5174, existingPorts: [5174] })).toThrow(/already used/i)
  })

  it.each(['../outside', '../../outside', 'bad/name', "bad'name", 'Uppercase'])(
    'rejects unsafe game name %s',
    (name) => {
      expect(() => planNewGame(name)).toThrow(/game name/i)
    }
  )

  it.each([Number.NaN, 0, -1, 5177.5, 65_536])('rejects invalid port %s', (port) => {
    expect(() => planNewGame('starfall', { port })).toThrow(/port/i)
  })

  it('title-cases slugs for labels', () => {
    expect(titleCase('beacon-run')).toBe('Beacon Run')
    expect(titleCase('x')).toBe('X')
  })
})
