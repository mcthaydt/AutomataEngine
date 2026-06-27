import { createWorld, type RenderPort } from '@automata/engine'
import type { GameDefinition, SceneModel } from '../../src/model/gameDefinition'
import { CommandError } from '../../src/model/gameDefinition'
import type { SceneItem, Surface } from '../../src/model/types'

/** A minimal non-game document: a flat item list plus a title. */
export interface FakeDoc { title: string; items: SceneItem[] }

function sameSurface(a: Surface, b: Surface): boolean {
  if (a.kind === 'color' && b.kind === 'color') return a.value === b.value
  if (a.kind === 'texture' && b.kind === 'texture') return a.textureId === b.textureId
  return false
}

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
      {
        const items = doc.items.filter((item) => !cmd.ids.includes(item.id))
        return items.length === doc.items.length ? doc : { ...doc, items }
      }
      case 'moveSelected': {
        if (cmd.ids.length === 0 || (cmd.delta.x === 0 && cmd.delta.y === 0 && cmd.delta.z === 0)) {
          return doc
        }
        const items = doc.items.map((item) =>
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
        return items.every((item, index) => item === doc.items[index]) ? doc : {
          ...doc,
          items
        }
      }
      case 'setSurface': {
        const item = doc.items.find((candidate) => candidate.id === cmd.id)
        if (item && sameSurface(item.surface, cmd.surface)) return doc
        const items = doc.items.map((candidate) =>
          candidate.id === cmd.id ? { ...candidate, surface: cmd.surface } : candidate)
        return items.every((candidate, index) => candidate === doc.items[index]) ? doc : {
          ...doc,
          items
        }
      }
      case 'setMetadata':
        if (cmd.path === 'title') {
          const title = String(cmd.value)
          return title === doc.title ? doc : { ...doc, title }
        }
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

export function cylinderItem(id: string, radius = 1, height = 1): SceneItem {
  return {
    id,
    kind: 'cylinder',
    transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
    shape: { type: 'cylinder', radius, height },
    surface: { kind: 'color', value: '#e0e0e0' }
  }
}

export function archetypeItem(id: string, name = 'foo'): SceneItem {
  return {
    id,
    kind: 'archetype',
    transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
    shape: { type: 'archetype', name },
    surface: { kind: 'color', value: '#e0e0e0' }
  }
}

export function markerItem(id: string, markerId = 'start'): SceneItem {
  return {
    id,
    kind: 'marker',
    transform: { position: { x: 0, y: 0, z: 0 }, rotationEuler: { x: 0, y: 0, z: 0 } },
    shape: { type: 'marker', markerId },
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

export const playCalls: string[] = []

export const playableDefinition: GameDefinition<FakeDoc> = {
  ...renderDefinition,
  play: {
    createGameplay: () => {
      playCalls.push('create')
      return {
        fixedUpdate: () => playCalls.push('fixed'),
        render: () => playCalls.push('render'),
        dispose: () => playCalls.push('dispose')
      }
    },
    runHeadlessPlay: async () => ({
      outcome: 'incomplete',
      timeMs: 0,
      fallCount: 0,
      bananas: 0,
      steps: 0
    })
  }
}
