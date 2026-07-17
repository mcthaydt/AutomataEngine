import { describe, expect, it } from 'vitest'
import { validateProject, type ProjectSnapshot } from '@automata/project'
import { projectDefinition } from '../../src'
import { compileProject } from '../../src/project/compiler'
import { createTemplate } from '../../src/project/template'

const codes = (snapshot: ProjectSnapshot): string[] =>
  validateProject(projectDefinition, snapshot).map((issue) => issue.code)

describe('project definition', () => {
  it('validates and compiles the template cleanly', () => {
    const snapshot = createTemplate()
    expect(validateProject(projectDefinition, snapshot)).toEqual([])
    const compiled = compileProject(snapshot)
    expect(compiled.spawn).toEqual({ x: -8, z: -8 })
    expect(compiled.tuning.goal).toEqual({ x: 8, z: 8 })
    expect(projectDefinition.compile(snapshot)).toEqual(compiled)
  })

  it('flags a missing entry scene', () => {
    const snapshot = createTemplate()
    snapshot.scenes = {}
    expect(codes(snapshot)).toContain('first-light.scene')
  })

  it('flags zero and multiple spawn points', () => {
    const none = createTemplate()
    none.scenes.main!.entities = []
    expect(codes(none)).toContain('first-light.spawnPoint')

    const extra = createTemplate()
    const clone = structuredClone(extra.scenes.main!.entities[0]!)
    clone.id = 'spawn-2'
    extra.scenes.main!.entities.push(clone)
    expect(codes(extra)).toContain('first-light.spawnPoint')
  })

  it('flags a goal outside the arena on either axis', () => {
    for (const axis of ['x', 'z'] as const) {
      const snapshot = createTemplate()
      const data = snapshot.resources.tuning!.data as { goal: { x: number; z: number } }
      data.goal[axis] = 99
      expect(codes(snapshot)).toContain('first-light.goal')
    }
  })

  it('leaves missing tuning to compile, which throws loudly', () => {
    const snapshot = createTemplate()
    snapshot.resources = {}
    snapshot.manifest.resources = []
    expect(projectDefinition.validate(snapshot).map((issue) => issue.code)).not.toContain('first-light.goal')
    expect(() => compileProject(snapshot)).toThrow(/tuning/i)
  })

  it('rejects compiling snapshots missing their scene, spawn, or transform', () => {
    const noScene = createTemplate()
    noScene.manifest.entrySceneId = 'other'
    expect(() => compileProject(noScene)).toThrow(/entry scene/i)

    const noSpawn = createTemplate()
    noSpawn.scenes.main!.entities = []
    expect(() => compileProject(noSpawn)).toThrow(/spawn point/i)

    const noTransform = createTemplate()
    const spawn = noTransform.scenes.main!.entities[0]!
    spawn.components = spawn.components.filter((component) => component.typeId !== 'core.transform')
    expect(() => compileProject(noTransform)).toThrow(/transform/i)
  })
})
