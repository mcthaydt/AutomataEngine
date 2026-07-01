import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, CylinderGeometry,
  DirectionalLight, GridHelper, Group, Material, Mesh, MeshStandardMaterial, Object3D,
  PerspectiveCamera, Scene, SphereGeometry
} from 'three'
import type { RenderableDef } from './types'
import type { GridId, GroupId, RenderPort } from './port'

/** Vertical FOV (degrees) of the renderer's perspective camera. Single source of truth. */
export const PERSPECTIVE_FOV_DEG = 60

export interface ThreeRenderer {
  port: RenderPort
  scene: Scene
  camera: PerspectiveCamera
  resizeViewport(width: number, height: number): void
}

function createGeometry(def: RenderableDef): BufferGeometry {
  switch (def.primitive) {
    case 'sphere': return new SphereGeometry(def.radius, 24, 16)
    case 'box': return new BoxGeometry(def.size.x, def.size.y, def.size.z)
    case 'cylinder': return new CylinderGeometry(def.radius, def.radius, def.height, 24)
  }
}

function geometryKey(def: RenderableDef): string {
  switch (def.primitive) {
    case 'sphere': return `sphere:${def.radius}`
    case 'box': return `box:${def.size.x}:${def.size.y}:${def.size.z}`
    case 'cylinder': return `cylinder:${def.radius}:${def.height}`
  }
}

function meshKey(def: RenderableDef): string {
  return `${geometryKey(def)}:${def.color}`
}

export function createThreeRenderer(): ThreeRenderer {
  const scene = new Scene()
  scene.background = new Color('#0e1320')
  const camera = new PerspectiveCamera(PERSPECTIVE_FOV_DEG, 16 / 9, 0.1, 200)
  camera.position.set(0, 6, 10)

  const ambient = new AmbientLight('#ffffff', 0.6)
  scene.add(ambient)
  const sun = new DirectionalLight('#ffffff', 1.4)
  sun.position.set(6, 12, 4)
  scene.add(sun)

  const meshes = new Map<object, Mesh>()
  const activeMeshKeys = new Map<object, string>()
  const geometryCache = new Map<string, BufferGeometry>()
  const meshPool = new Map<string, Mesh[]>()
  const groups = new Map<GroupId, Group>()
  const grids = new Map<GridId, GridHelper>()
  let nextGroupId: GroupId = 1
  let nextGridId: GridId = 1

  const geometryFor = (def: RenderableDef): BufferGeometry => {
    const key = geometryKey(def)
    let geometry = geometryCache.get(key)
    if (!geometry) {
      geometry = createGeometry(def)
      geometryCache.set(key, geometry)
    }
    return geometry
  }

  const parentOf = (group?: GroupId): Object3D => {
    if (group === undefined) return scene
    const found = groups.get(group)
    if (!found) throw new Error(`Unknown render group ${group}`)
    return found
  }

  const port: RenderPort = {
    get objectCount() { return meshes.size },

    createGroup(parent) {
      const group = new Group()
      parentOf(parent).add(group)
      const id = nextGroupId++
      groups.set(id, group)
      return id
    },

    setGroupRotation(groupId, eulerRad) {
      const group = groups.get(groupId)
      if (!group) throw new Error(`Unknown render group ${groupId}`)
      group.rotation.set(eulerRad.x, eulerRad.y, eulerRad.z)
    },

    removeGroup(groupId) {
      const group = groups.get(groupId)
      if (!group) return
      group.removeFromParent()
      groups.delete(groupId)
    },

    setGrid({ size, divisions, color }) {
      const grid = new GridHelper(size, divisions, new Color(color), new Color(color))
      scene.add(grid)
      const id = nextGridId++
      grids.set(id, grid)
      return id
    },

    removeGrid(gridId) {
      const grid = grids.get(gridId)
      if (!grid) return
      grid.removeFromParent()
      grid.geometry.dispose()
      ;(grid.material as Material).dispose()
      grids.delete(gridId)
    },

    setHighlight(entity, on) {
      const mesh = meshes.get(entity)
      if (!mesh) return
      const material = mesh.material as MeshStandardMaterial
      material.emissive.set(on ? '#ffffff' : '#000000')
      material.emissiveIntensity = on ? 0.4 : 0
    },

    add(entity, def, group) {
      if (meshes.has(entity)) return
      const key = meshKey(def)
      const pool = meshPool.get(key)
      const mesh = pool?.pop() ?? new Mesh(
        geometryFor(def),
        new MeshStandardMaterial({ color: def.color })
      )
      parentOf(group).add(mesh)
      meshes.set(entity, mesh)
      activeMeshKeys.set(entity, key)
    },

    setPose(entity, position, rotation) {
      const mesh = meshes.get(entity)
      if (!mesh) return
      mesh.position.set(position.x, position.y, position.z)
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    },

    remove(entity) {
      const mesh = meshes.get(entity)
      if (!mesh) return
      mesh.removeFromParent()
      mesh.position.set(0, 0, 0)
      mesh.quaternion.identity()
      mesh.scale.set(1, 1, 1)
      const material = mesh.material as MeshStandardMaterial
      material.emissive.set('#000000')
      material.emissiveIntensity = 0
      const key = activeMeshKeys.get(entity)!
      meshes.delete(entity)
      activeMeshKeys.delete(entity)
      const pool = meshPool.get(key) ?? []
      pool.push(mesh)
      meshPool.set(key, pool)
    },

    setCamera(position, lookAt) {
      camera.position.set(position.x, position.y, position.z)
      camera.lookAt(lookAt.x, lookAt.y, lookAt.z)
    },

    dispose() {
      const materials = new Set<Material>()
      for (const mesh of meshes.values()) {
        mesh.removeFromParent()
        materials.add(mesh.material as Material)
      }
      for (const pool of meshPool.values()) {
        for (const mesh of pool) materials.add(mesh.material as Material)
      }
      for (const material of materials) material.dispose()
      for (const geometry of geometryCache.values()) geometry.dispose()
      meshes.clear()
      activeMeshKeys.clear()
      meshPool.clear()
      geometryCache.clear()
      for (const group of groups.values()) group.removeFromParent()
      groups.clear()
      for (const grid of grids.values()) {
        grid.removeFromParent()
        grid.geometry.dispose()
        ;(grid.material as Material).dispose()
      }
      grids.clear()
      scene.remove(ambient, sun)
    }
  }

  return {
    port,
    scene,
    camera,
    resizeViewport(width, height) {
      if (width <= 0 || height <= 0) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
  }
}
