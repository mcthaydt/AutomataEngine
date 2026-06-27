import { parseData, type Vec3 } from '@automata/engine'
import {
  CommandError, type Field, type SceneItem, type SceneModel, type Surface
} from '@automata/editor'
import { entityUid, geometryUid, levelKind, type Level } from '../data/level'

type Geometry = Level['geometry'][number]
type Tuple3 = [number, number, number]

const noRot = { x: 0, y: 0, z: 0 }
const vec = (tuple: Tuple3): Vec3 => ({ x: tuple[0], y: tuple[1], z: tuple[2] })
const colorSurface = (value: string): Surface => ({ kind: 'color', value })

/** Freeze a stable uid onto every geometry/entity that lacks one (shipped levels gain none on disk). */
function ensureUids(level: Level): Level {
  const used = new Set<string>()
  for (const g of level.geometry) if (g.uid) used.add(g.uid)
  for (const e of level.entities) if (e.uid) used.add(e.uid)
  const fresh = (prefix: string): string => {
    let n = 0
    let id = `${prefix}:${n}`
    while (used.has(id)) id = `${prefix}:${++n}`
    used.add(id)
    return id
  }
  return {
    ...level,
    geometry: level.geometry.map((g) => (g.uid ? g : { ...g, uid: fresh('geometry') })),
    entities: level.entities.map((e) => (e.uid ? e : { ...e, uid: fresh('entity') }))
  }
}

function geometryItem(geometry: Geometry, id: string): SceneItem {
  const shape = geometry.shape === 'box'
    ? { type: 'box' as const, size: { x: geometry.size[0], y: geometry.size[1], z: geometry.size[2] } }
    : { type: 'cylinder' as const, radius: geometry.radius, height: geometry.height }
  return {
    id,
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

function entityItem(entity: Level['entities'][number], id: string): SceneItem {
  return {
    id,
    kind: 'archetype',
    transform: { position: vec(entity.pos), rotationEuler: noRot },
    shape: { type: 'archetype', name: entity.archetype },
    surface: colorSurface('#9b5de5')
  }
}

const addDelta = (tuple: Tuple3, delta: Vec3): Tuple3 =>
  [tuple[0] + delta.x, tuple[1] + delta.y, tuple[2] + delta.z]
const sameVec = (a: Vec3, b: Vec3): boolean =>
  a.x === b.x && a.y === b.y && a.z === b.z
const zeroDelta = (value: Vec3): boolean => sameVec(value, { x: 0, y: 0, z: 0 })

function stableIds(level: Level): Set<string> {
  return new Set([
    ...level.geometry.map((geometry, index) => geometryUid(geometry, index)),
    ...level.entities.map((entity, index) => entityUid(entity, index)),
    'marker:spawn',
    'marker:goal'
  ])
}

function requireTargets(level: Level, ids: readonly string[]): void {
  const currentIds = stableIds(level)
  for (const id of ids) {
    if (!currentIds.has(id)) throw new CommandError(`unknown item ${id}`)
  }
}

export const levelSceneModel: SceneModel<Level> = {
  parse: (input) => ensureUids(typeof input === 'string'
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
      uid: 'geometry:0',
      size: [8, 0.5, 16],
      pos: [0, -0.25, 0],
      color: '#7ec850',
      friction: 0.6
    }],
    entities: []
  }),

  listItems: (level) => [
    ...level.geometry.map((geometry, index) => geometryItem(geometry, geometryUid(geometry, index))),
    ...level.entities.map((entity, index) => entityItem(entity, entityUid(entity, index))),
    markerItem('spawn', level.spawn),
    markerItem('goal', level.goal.pos)
  ],

  metadataFields: (level): Field[] => [
    { path: 'name', label: 'Name', type: 'text', value: level.name },
    { path: 'timeLimitS', label: 'Time limit (s)', type: 'number', value: level.timeLimitS },
    { path: 'fallY', label: 'Fall Y', type: 'number', value: level.fallY }
  ],

  getSurface: (level, id) => {
    const geometry = level.geometry.find((g, i) => geometryUid(g, i) === id)
    return colorSurface(geometry ? geometry.color : '#ffffff')
  },

  apply(level, cmd) {
    switch (cmd.type) {
      case 'moveSelected': {
        if (cmd.ids.length === 0) return level
        requireTargets(level, cmd.ids)
        if (zeroDelta(cmd.delta)) return level
        const ids = new Set(cmd.ids)
        let next = level
        if (ids.has('marker:spawn')) next = { ...next, spawn: addDelta(next.spawn, cmd.delta) }
        if (ids.has('marker:goal')) next = { ...next, goal: { pos: addDelta(next.goal.pos, cmd.delta) } }
        return {
          ...next,
          geometry: next.geometry.map((geometry, gi) =>
            ids.has(geometryUid(geometry, gi)) ? { ...geometry, pos: addDelta(geometry.pos, cmd.delta) } : geometry),
          entities: next.entities.map((entity, ei) =>
            ids.has(entityUid(entity, ei)) ? { ...entity, pos: addDelta(entity.pos, cmd.delta) } : entity)
        }
      }
      case 'setSurface': {
        const surface = cmd.surface
        if (surface.kind !== 'color') throw new CommandError('only color surfaces supported')
        requireTargets(level, [cmd.id])
        const index = level.geometry.findIndex((geometry, gi) => geometryUid(geometry, gi) === cmd.id)
        if (index < 0) throw new CommandError(`surface edit unsupported for ${cmd.id}`)
        if (level.geometry[index]!.color === surface.value) return level
        return {
          ...level,
          geometry: level.geometry.map((geometry, gi) =>
            gi === index ? { ...geometry, color: surface.value } : geometry)
        }
      }
      case 'setMetadata': {
        if (cmd.path === 'name') {
          const value = String(cmd.value)
          return value === level.name ? level : { ...level, name: value }
        }
        if (cmd.path === 'timeLimitS') {
          const value = Number(cmd.value)
          return value === level.timeLimitS ? level : { ...level, timeLimitS: value }
        }
        if (cmd.path === 'fallY') {
          const value = Number(cmd.value)
          return value === level.fallY ? level : { ...level, fallY: value }
        }
        throw new CommandError(`unknown metadata ${cmd.path}`)
      }
      case 'deleteItems': {
        if (cmd.ids.length === 0) return level
        requireTargets(level, cmd.ids)
        const remove = new Set(cmd.ids)
        const deletable = new Set([
          ...level.geometry.map((g, i) => geometryUid(g, i)),
          ...level.entities.map((e, i) => entityUid(e, i))
        ])
        for (const id of remove) {
          if (!deletable.has(id)) throw new CommandError(`cannot delete ${id}`)
        }
        return {
          ...level,
          geometry: level.geometry.filter((g, i) => !remove.has(geometryUid(g, i))),
          entities: level.entities.filter((e, i) => !remove.has(entityUid(e, i)))
        }
      }
      case 'addItem': {
        const { shape, id } = cmd.item
        if (stableIds(level).has(id)) throw new CommandError(`duplicate item ${id}`)
        const pos: Tuple3 = [cmd.item.transform.position.x, cmd.item.transform.position.y, cmd.item.transform.position.z]
        const color = cmd.item.surface.kind === 'color' ? cmd.item.surface.value : '#ffffff'
        // The editor owns id allocation; the model adopts it as the stable uid so
        // listItems round-trips the same identity the editor placed and selected.
        const addGeometry = (geometry: Geometry): Level => ({ ...level, geometry: [...level.geometry, geometry] })
        if (shape.type === 'box') {
          return addGeometry({
            shape: 'box', uid: id, size: [shape.size.x, shape.size.y, shape.size.z], pos, color, friction: 0.6
          })
        }
        if (shape.type === 'cylinder') {
          return addGeometry({
            shape: 'cylinder', uid: id, radius: shape.radius, height: shape.height, pos, color, friction: 0.6
          })
        }
        if (shape.type === 'archetype') {
          return { ...level, entities: [...level.entities, { archetype: shape.name, uid: id, pos }] }
        }
        throw new CommandError('markers are singletons and cannot be added')
      }
      case 'setItemField': {
        requireTargets(level, [cmd.id])
        const index = level.geometry.findIndex((g, i) => geometryUid(g, i) === cmd.id)
        if (index < 0) throw new CommandError(`field edit unsupported for ${cmd.id}`)
        const geometry = level.geometry[index]!
        const axisName = cmd.path.split('.')[1]
        const axis = axisName === 'x' ? 0 : axisName === 'y' ? 1 : axisName === 'z' ? 2 : undefined
        const value = Number(cmd.value)
        if (cmd.path.startsWith('pos.') && axis !== undefined && geometry.pos[axis] === value) return level
        if (cmd.path.startsWith('size.') && axis !== undefined && geometry.shape === 'box' && geometry.size[axis] === value) return level
        if (cmd.path === 'radius' && geometry.shape === 'cylinder' && geometry.radius === value) return level
        if (cmd.path === 'height' && geometry.shape === 'cylinder' && geometry.height === value) return level
        return {
          ...level,
          geometry: level.geometry.map((geometry, gi) => {
            if (gi !== index) return geometry
            if (cmd.path.startsWith('pos.') && axis !== undefined) {
              const pos = [...geometry.pos] as Tuple3
              pos[axis] = value
              return { ...geometry, pos }
            }
            if (cmd.path.startsWith('size.') && axis !== undefined && geometry.shape === 'box') {
              const size = [...geometry.size] as Tuple3
              size[axis] = value
              return { ...geometry, size }
            }
            if (cmd.path === 'radius' && geometry.shape === 'cylinder') return { ...geometry, radius: value }
            if (cmd.path === 'height' && geometry.shape === 'cylinder') return { ...geometry, height: value }
            throw new CommandError(`unsupported field ${cmd.path}`)
          })
        }
      }
      case 'loadDoc':
        return this.parse(cmd.doc)
    }
  }
}
