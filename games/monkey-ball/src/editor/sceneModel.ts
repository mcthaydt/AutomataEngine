import { parseData, type Vec3 } from '@automata/engine'
import {
  CommandError, type Field, type SceneItem, type SceneModel, type Surface
} from '@automata/editor'
import { levelKind, type Level } from '../data/level'

type Geometry = Level['geometry'][number]
type Tuple3 = [number, number, number]

const noRot = { x: 0, y: 0, z: 0 }
const vec = (tuple: Tuple3): Vec3 => ({ x: tuple[0], y: tuple[1], z: tuple[2] })
const colorSurface = (value: string): Surface => ({ kind: 'color', value })

function geometryItem(geometry: Geometry, index: number): SceneItem {
  const shape = geometry.shape === 'box'
    ? { type: 'box' as const, size: { x: geometry.size[0], y: geometry.size[1], z: geometry.size[2] } }
    : { type: 'cylinder' as const, radius: geometry.radius, height: geometry.height }
  return {
    id: `geometry:${index}`,
    kind: geometry.shape === 'box' ? 'box' : 'cylinder',
    transform: { position: vec(geometry.pos), rotationEuler: geometry.rot ? vec(geometry.rot) : noRot },
    shape,
    surface: colorSurface(geometry.color)
  }
}

function markerItem(markerId: 'spawn' | 'goal', pos: Tuple3): SceneItem {
  return {
    id: `marker:${markerId}`,
    kind: 'marker',
    transform: { position: vec(pos), rotationEuler: noRot },
    shape: { type: 'marker', markerId },
    surface: colorSurface(markerId === 'goal' ? '#4ecdc4' : '#ffffff')
  }
}

function entityItem(entity: Level['entities'][number], index: number): SceneItem {
  return {
    id: `entity:${index}`,
    kind: 'archetype',
    transform: { position: vec(entity.pos), rotationEuler: noRot },
    shape: { type: 'archetype', name: entity.archetype },
    surface: colorSurface('#9b5de5')
  }
}

const addDelta = (tuple: Tuple3, delta: Vec3): Tuple3 =>
  [tuple[0] + delta.x, tuple[1] + delta.y, tuple[2] + delta.z]

const geometryIndex = (id: string): number => Number(id.slice('geometry:'.length))
const entityIndex = (id: string): number => Number(id.slice('entity:'.length))

export const levelSceneModel: SceneModel<Level> = {
  parse: (input) => (typeof input === 'string'
    ? parseData(levelKind, input, 'imported.json')
    : levelKind.schema.parse(input)),

  emptyDoc: () => ({
    id: 'untitled',
    name: 'Untitled',
    timeLimitS: 60,
    fallY: -10,
    spawn: [0, 1, 6],
    goal: { pos: [0, 0, -6] },
    geometry: [{
      shape: 'box',
      size: [8, 0.5, 16],
      pos: [0, -0.25, 0],
      color: '#7ec850',
      friction: 0.6
    }],
    entities: []
  }),

  listItems: (level) => [
    ...level.geometry.map(geometryItem),
    ...level.entities.map(entityItem),
    markerItem('spawn', level.spawn),
    markerItem('goal', level.goal.pos)
  ],

  metadataFields: (level): Field[] => [
    { path: 'name', label: 'Name', type: 'text', value: level.name },
    { path: 'timeLimitS', label: 'Time limit (s)', type: 'number', value: level.timeLimitS },
    { path: 'fallY', label: 'Fall Y', type: 'number', value: level.fallY }
  ],

  getSurface: (level, id) => {
    if (id.startsWith('geometry:')) {
      const geometry = level.geometry[geometryIndex(id)]
      if (geometry) return colorSurface(geometry.color)
    }
    return colorSurface('#ffffff')
  },

  apply(level, cmd) {
    switch (cmd.type) {
      case 'moveSelected': {
        let next = level
        for (const id of cmd.ids) {
          if (id === 'marker:spawn') next = { ...next, spawn: addDelta(next.spawn, cmd.delta) }
          else if (id === 'marker:goal') next = { ...next, goal: { pos: addDelta(next.goal.pos, cmd.delta) } }
          else if (id.startsWith('geometry:')) {
            const index = geometryIndex(id)
            next = {
              ...next,
              geometry: next.geometry.map((geometry, gi) =>
                gi === index ? { ...geometry, pos: addDelta(geometry.pos, cmd.delta) } : geometry)
            }
          } else if (id.startsWith('entity:')) {
            const index = entityIndex(id)
            next = {
              ...next,
              entities: next.entities.map((entity, ei) =>
                ei === index ? { ...entity, pos: addDelta(entity.pos, cmd.delta) } : entity)
            }
          }
        }
        return next
      }
      case 'setSurface': {
        const surface = cmd.surface
        if (surface.kind !== 'color') throw new CommandError('only color surfaces supported')
        if (cmd.id.startsWith('geometry:')) {
          const index = geometryIndex(cmd.id)
          return {
            ...level,
            geometry: level.geometry.map((geometry, gi) =>
              gi === index ? { ...geometry, color: surface.value } : geometry)
          }
        }
        return level
      }
      case 'setMetadata': {
        if (cmd.path === 'name') return { ...level, name: String(cmd.value) }
        if (cmd.path === 'timeLimitS') return { ...level, timeLimitS: Number(cmd.value) }
        if (cmd.path === 'fallY') return { ...level, fallY: Number(cmd.value) }
        throw new CommandError(`unknown metadata ${cmd.path}`)
      }
      case 'deleteItems': {
        const geometry = new Set<number>()
        const entities = new Set<number>()
        for (const id of cmd.ids) {
          if (id.startsWith('geometry:')) geometry.add(geometryIndex(id))
          else if (id.startsWith('entity:')) entities.add(entityIndex(id))
          else throw new CommandError('spawn/goal cannot be deleted')
        }
        return {
          ...level,
          geometry: level.geometry.filter((_, index) => !geometry.has(index)),
          entities: level.entities.filter((_, index) => !entities.has(index))
        }
      }
      case 'addItem': {
        const item = cmd.item
        if (item.shape.type === 'box') {
          return {
            ...level,
            geometry: [...level.geometry, {
              shape: 'box',
              size: [item.shape.size.x, item.shape.size.y, item.shape.size.z],
              pos: [item.transform.position.x, item.transform.position.y, item.transform.position.z],
              color: item.surface.kind === 'color' ? item.surface.value : '#ffffff',
              friction: 0.6
            }]
          }
        }
        if (item.shape.type === 'cylinder') {
          return {
            ...level,
            geometry: [...level.geometry, {
              shape: 'cylinder',
              radius: item.shape.radius,
              height: item.shape.height,
              pos: [item.transform.position.x, item.transform.position.y, item.transform.position.z],
              color: item.surface.kind === 'color' ? item.surface.value : '#ffffff',
              friction: 0.6
            }]
          }
        }
        if (item.shape.type === 'archetype') {
          return {
            ...level,
            entities: [...level.entities, {
              archetype: item.shape.name,
              pos: [item.transform.position.x, item.transform.position.y, item.transform.position.z]
            }]
          }
        }
        throw new CommandError('markers are singletons and cannot be added')
      }
      case 'setItemField': {
        if (!cmd.id.startsWith('geometry:')) throw new CommandError(`field edit unsupported for ${cmd.id}`)
        const index = geometryIndex(cmd.id)
        const axis = { x: 0, y: 1, z: 2 }[cmd.path.split('.')[1] as 'x' | 'y' | 'z']
        return {
          ...level,
          geometry: level.geometry.map((geometry, gi) => {
            if (gi !== index) return geometry
            if (cmd.path.startsWith('pos.')) {
              const pos = [...geometry.pos] as Tuple3
              pos[axis] = Number(cmd.value)
              return { ...geometry, pos }
            }
            if (cmd.path.startsWith('size.') && geometry.shape === 'box') {
              const size = [...geometry.size] as Tuple3
              size[axis] = Number(cmd.value)
              return { ...geometry, size }
            }
            if (cmd.path === 'radius' && geometry.shape === 'cylinder') return { ...geometry, radius: Number(cmd.value) }
            if (cmd.path === 'height' && geometry.shape === 'cylinder') return { ...geometry, height: Number(cmd.value) }
            throw new CommandError(`unsupported field ${cmd.path}`)
          })
        }
      }
      case 'loadDoc':
        return this.parse(cmd.doc)
    }
  }
}
