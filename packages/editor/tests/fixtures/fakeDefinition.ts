import { createWorld, type RenderPort } from '@automata/engine'
import type { GameDefinition, SceneModel } from '../../src/model/gameDefinition'
import { CommandError } from '../../src/model/gameDefinition'
import type { SceneItem, Surface } from '../../src/model/types'

/** A minimal non-game document: a flat item list plus a title. */
export interface FakeDoc { title: string; items: SceneItem[] }

const fakeScene: SceneModel<FakeDoc> = {
  parse: (input) => input as FakeDoc,
  emptyDoc: () => ({ title: 'untitled', items: [] }),
  listItems: (doc) => doc.items,
  metadataFields: (doc) => [{ path: 'title', label: 'Title', type: 'text', value: doc.title }],
  getSurface: (doc, id) =>
    doc.items.find((item) => item.id === id)?.surface ?? { kind: 'color', value: '#fff' },
  apply(doc, cmd) {
    switch (cmd.type) {
      case 'addItem':
        return { ...doc, items: [...doc.items, cmd.item] }
      case 'deleteItems':
        return { ...doc, items: doc.items.filter((item) => !cmd.ids.includes(item.id)) }
      case 'moveSelected':
        return {
          ...doc,
          items: doc.items.map((item) =>
            cmd.ids.includes(item.id)
              ? {
                  ...item,
                  transform: {
                    ...item.transform,
                    position: {
                      x: item.transform.position.x + cmd.delta.x,
                      y: item.transform.position.y + cmd.delta.y,
                      z: item.transform.position.z + cmd.delta.z
                    }
                  }
                }
              : item)
        }
      case 'setSurface':
        return {
          ...doc,
          items: doc.items.map((item) =>
            item.id === cmd.id ? { ...item, surface: cmd.surface } : item)
        }
      case 'setMetadata':
        if (cmd.path === 'title') return { ...doc, title: String(cmd.value) }
        throw new CommandError(`unknown metadata ${cmd.path}`)
      case 'setItemField':
        throw new CommandError('fake has no item fields')
      case 'loadDoc':
        return fakeScene.parse(cmd.doc)
    }
  }
}

const swatch = (value: string): Surface => ({ kind: 'color', value })

export const fakeDefinition: GameDefinition<FakeDoc> = {
  id: 'fake',
  scene: fakeScene,
  palette: {
    geometry: [{
      id: 'box',
      label: 'Box',
      kind: 'box',
      place: 'point',
      cardinality: { min: 0, max: Number.POSITIVE_INFINITY }
    }],
    archetypes: [],
    markers: [{
      id: 'start',
      label: 'Start',
      kind: 'marker',
      place: 'point',
      ref: 'start',
      cardinality: { min: 1, max: 1 }
    }]
  },
  surfacePalette: [swatch('#e0e0e0'), swatch('#ff5964'), swatch('#4ecdc4')],
  buildWorld: () => { throw new Error('fake buildWorld unused in core tests') },
  resolveSurface: (surface) => {
    if (surface.kind === 'color') return { color: surface.value }
    throw new CommandError(`unsupported surface ${surface.kind}`)
  }
}

export function boxItem(id: string, x = 0, z = 0): SceneItem {
  return {
    id,
    kind: 'box',
    transform: { position: { x, y: 0, z }, rotationEuler: { x: 0, y: 0, z: 0 } },
    shape: { type: 'box', size: { x: 1, y: 1, z: 1 } },
    surface: { kind: 'color', value: '#e0e0e0' }
  }
}

/** A fake buildWorld: one renderable box entity per item, carrying editorId. */
export function fakeBuildWorld(doc: FakeDoc, _render: RenderPort) {
  void _render
  const world = createWorld<{ editorId?: string; renderable?: unknown; transform?: unknown }>()
  for (const item of doc.items) {
    world.add({
      editorId: item.id,
      renderable: { primitive: 'box', size: { x: 1, y: 1, z: 1 }, color: '#e0e0e0' },
      transform: {
        position: item.transform.position,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        prevPosition: item.transform.position,
        prevRotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    })
  }
  return world
}

export const renderDefinition: GameDefinition<FakeDoc> = {
  ...fakeDefinition,
  buildWorld: fakeBuildWorld as never
}
