import { describe, expect, it } from 'vitest'
import { createProjectCatalog, resolveRegistrationLoader } from '../../src/project/catalog'
import { registerEditorProject } from '../../src/project/registration'
import { fakeEditorRegistration } from '../fixtures/fakeProject'

const registered = (gameId: string) => ({ ...registerEditorProject(fakeEditorRegistration), gameId })

describe('createProjectCatalog', () => {
  it('lists registrations in insertion order and looks up by game ID', () => {
    const first = registered('alpha')
    const second = registered('beta')
    const catalog = createProjectCatalog([first, second])

    expect(catalog.list().map((entry) => entry.gameId)).toEqual(['alpha', 'beta'])
    expect(catalog.get('beta')).toBe(second)
    expect(catalog.get('missing')).toBeUndefined()
  })

  it('returns a defensive copy from list()', () => {
    const catalog = createProjectCatalog([registered('alpha')])
    catalog.list().pop()
    expect(catalog.list()).toHaveLength(1)
  })

  it('rejects duplicate game IDs, naming the offender', () => {
    expect(() => createProjectCatalog([registered('alpha'), registered('alpha')]))
      .toThrow(/duplicate.*"alpha"/i)
  })
})

describe('resolveRegistrationLoader', () => {
  it('returns the named loader export', async () => {
    const loader = async () => fakeEditorRegistration
    const resolved = resolveRegistrationLoader(
      { loadEditorRegistration: loader },
      'loadEditorRegistration',
      'games/fake/src/project/editor.ts'
    )
    expect(resolved).toBe(loader)
  })

  it('rejects a module missing the loader export, naming path and export', () => {
    expect(() => resolveRegistrationLoader({}, 'loadEditorRegistration', 'games/broken/src/project/editor.ts'))
      .toThrow(/loadEditorRegistration.*games\/broken\/src\/project\/editor\.ts/)
  })

  it('rejects a non-function loader export', () => {
    expect(() => resolveRegistrationLoader(
      { loadHeadlessRegistration: 42 },
      'loadHeadlessRegistration',
      'games/broken/src/project/index.ts'
    )).toThrow(/loadHeadlessRegistration.*games\/broken\/src\/project\/index\.ts/)
  })

  it('rejects a non-object module', () => {
    expect(() => resolveRegistrationLoader(undefined, 'loadEditorRegistration', 'games/broken/src/project/editor.ts'))
      .toThrow(/games\/broken\/src\/project\/editor\.ts/)
  })
})
