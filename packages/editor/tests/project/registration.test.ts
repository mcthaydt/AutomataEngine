import { describe, expect, it } from 'vitest'
import { registerEditorProject } from '../../src/project/registration'
import { fakeEditorRegistration, fakeSnapshot } from '../fixtures/fakeProject'

describe('editor project registration', () => {
  it('erases the compiled type while preserving behavior', async () => {
    const snapshot = fakeSnapshot()
    const erased = registerEditorProject(fakeEditorRegistration)
    expect(erased.gameId).toBe('fake')
    expect(erased.createTemplate().manifest.gameId).toBe('fake')
    expect(erased.compile(snapshot)).toEqual({ snapshot })
    expect(erased.evaluate).toBeDefined()
    expect(await erased.evaluate!(snapshot, { maxSteps: 10 })).toEqual({
      outcome: 'passed', score: 1, metrics: { boxes: 1 }, steps: 1
    })
  })

  it('merges core components and exposes prefabs', () => {
    const erased = registerEditorProject(fakeEditorRegistration)
    expect(erased.componentTypes.map((c) => c.typeId)).toContain('core.transform')
    expect(erased.componentTypes.map((c) => c.typeId)).toContain('fake.spawn')
    expect(erased.prefabs.map((p) => p.id)).toEqual(['box', 'spawn'])
  })

  it('rejects duplicate prefab IDs and prefab defaults that violate the registration', () => {
    expect(() => registerEditorProject({
      ...fakeEditorRegistration,
      prefabs: [fakeEditorRegistration.prefabs[0]!, fakeEditorRegistration.prefabs[0]!]
    })).toThrow(/duplicate/i)

    expect(() => registerEditorProject({
      ...fakeEditorRegistration,
      prefabs: [{ id: 'bad', label: 'Bad', components: [{ typeId: 'fake.spawn', data: { team: 'green' } }] }]
    })).toThrow(/invalid|default/i)
  })
})
