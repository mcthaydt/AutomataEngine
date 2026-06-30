import { projectFileDocuments, type ProjectSnapshot } from '@automata/project'
import { describe, expect, it } from 'vitest'
import { loadMonkeyBallProject } from '../../src/project/load'
import { createMonkeyBallTemplate } from '../../src/project/template'

function reader(snapshot: ProjectSnapshot) {
  const files = new Map(projectFileDocuments(snapshot).map((file) => [file.path, file.text]))
  return { readText: async (path: string) => files.get(path) ?? Promise.reject(new Error(path)) }
}

describe('Monkey Ball project loader', () => {
  it('loads, validates, and compiles a project folder', async () => {
    await expect(loadMonkeyBallProject(reader(createMonkeyBallTemplate())))
      .resolves.toMatchObject({ projectId: 'monkey-ball' })
  })

  it('rejects another game and invalid authored data', async () => {
    const wrong = createMonkeyBallTemplate()
    wrong.manifest.gameId = 'other'
    await expect(loadMonkeyBallProject(reader(wrong))).rejects.toThrow('Expected a Monkey Ball project')

    const invalid = createMonkeyBallTemplate()
    const goal = invalid.scenes['w1-l1']!.entities.find((entity) => entity.id === 'marker:goal')!
    goal.components = goal.components.filter((component) => component.typeId !== 'monkey-ball.goal')
    await expect(loadMonkeyBallProject(reader(invalid))).rejects.toThrow('Invalid Monkey Ball project')
  })
})
