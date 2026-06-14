import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, CylinderGeometry,
  DirectionalLight, Group, Material, Mesh, MeshStandardMaterial, Object3D,
  PerspectiveCamera, Scene, SphereGeometry
} from 'three'
import type { RenderableDef } from './types'
import type { GroupId, RenderPort } from './port'

export interface ThreeRenderer {
  port: RenderPort
  scene: Scene
  camera: PerspectiveCamera
}

function geometryFor(def: RenderableDef): BufferGeometry {
  switch (def.primitive) {
    case 'sphere': return new SphereGeometry(def.radius, 24, 16)
    case 'box': return new BoxGeometry(def.size.x, def.size.y, def.size.z)
    case 'cylinder': return new CylinderGeometry(def.radius, def.radius, def.height, 24)
  }
}

export function createThreeRenderer(): ThreeRenderer {
  const scene = new Scene()
  scene.background = new Color('#0e1320')
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 200)
  camera.position.set(0, 6, 10)

  const ambient = new AmbientLight('#ffffff', 0.6)
  scene.add(ambient)
  const sun = new DirectionalLight('#ffffff', 1.4)
  sun.position.set(6, 12, 4)
  scene.add(sun)

  const meshes = new Map<object, Mesh>()
  const groups = new Map<GroupId, Group>()
  let nextGroupId: GroupId = 1

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

    add(entity, def, group) {
      if (meshes.has(entity)) return
      const mesh = new Mesh(geometryFor(def), new MeshStandardMaterial({ color: def.color }))
      parentOf(group).add(mesh)
      meshes.set(entity, mesh)
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
      mesh.geometry.dispose()
      ;(mesh.material as Material).dispose()
      meshes.delete(entity)
    },

    setCamera(position, lookAt) {
      camera.position.set(position.x, position.y, position.z)
      camera.lookAt(lookAt.x, lookAt.y, lookAt.z)
    },

    dispose() {
      for (const entity of [...meshes.keys()]) port.remove(entity)
      for (const group of groups.values()) group.removeFromParent()
      groups.clear()
      scene.remove(ambient, sun)
    }
  }

  return { port, scene, camera }
}
