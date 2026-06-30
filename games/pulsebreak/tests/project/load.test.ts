import { projectFileDocuments, type ProjectSnapshot } from '@automata/project'
import { describe, expect, it } from 'vitest'
import { loadPulsebreakProject } from '../../src/project/load'
import { createPulsebreakTemplate } from '../../src/project/template'

function reader(snapshot: ProjectSnapshot) {
  const files = new Map(projectFileDocuments(snapshot).map((file) => [file.path, file.text]))
  return { readText: async (path: string) => files.get(path) ?? Promise.reject(new Error(path)) }
}

describe('Pulsebreak project loader', () => {
  it('loads, validates, and compiles a project folder', async () => {
    await expect(loadPulsebreakProject(reader(createPulsebreakTemplate())))
      .resolves.toMatchObject({ projectId: 'pulsebreak', sceneId: 'arena' })
  })

  it('rejects another game and invalid authored data', async () => {
    const wrong = createPulsebreakTemplate()
    wrong.manifest.gameId = 'other'
    await expect(loadPulsebreakProject(reader(wrong))).rejects.toThrow('Expected a Pulsebreak project')

    const invalid = createPulsebreakTemplate()
    ;(invalid.resources.tuning!.data as { arena: { half: number } }).arena.half = -1
    await expect(loadPulsebreakProject(reader(invalid))).rejects.toThrow('Invalid Pulsebreak project')
  })
})
