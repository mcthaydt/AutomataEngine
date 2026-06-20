import { describe, expect, it } from 'vitest'
import { createNullRenderer } from '@automata/engine'
import { createEditor } from '../../src/host'
import { mountPalette } from '../../src/ui/palette'
import { makeTestEditor, nullPhysics } from '../fixtures/editorHarness'
import { renderDefinition, type FakeDoc } from '../fixtures/fakeDefinition'

describe('palette panel', () => {
  it('renders Select + brushes and reflects the active tool', () => {
    const host = document.createElement('div')
    const editor = makeTestEditor()
    const handle = mountPalette(editor, host)

    expect(host.querySelector('[data-tool="select"]')).not.toBeNull()
    expect(host.querySelectorAll('[data-brush]').length).toBeGreaterThan(0)

    host.querySelector<HTMLButtonElement>('[data-brush="box"]')!.click()
    handle.update(editor.store.getState())
    expect(editor.store.getState().tool.selection).toEqual({ brushId: 'box', mode: 'place' })
    expect(host.querySelector('[data-brush="box"]')!.getAttribute('aria-pressed')).toBe('true')

    host.querySelector<HTMLButtonElement>('[data-tool="select"]')!.click()
    handle.update(editor.store.getState())
    expect(host.querySelector('[data-tool="select"]')!.getAttribute('aria-pressed')).toBe('true')

    handle.dispose()
    editor.dispose()
  })

  it('skips empty brush groups', () => {
    const host = document.createElement('div')
    const editor = createEditor<FakeDoc>({
      definition: {
        ...renderDefinition,
        palette: { geometry: [], archetypes: [], markers: renderDefinition.palette.markers }
      },
      render: createNullRenderer().port,
      physics: nullPhysics()
    })
    const handle = mountPalette(editor, host)
    const groups = [...host.querySelectorAll('.ed-group-label')].map((el) => el.textContent)
    expect(groups).toEqual(['Markers'])
    handle.dispose()
    editor.dispose()
  })
})
