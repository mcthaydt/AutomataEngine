import RAPIER from '@dimforge/rapier3d-compat'
import type { Vec3 } from '../math/vec3'
import type { Pose, RigidBodyDef, ShapeDef } from './types'
import type { PhysicsEvent, PhysicsPort } from './port'

let rapierReady: Promise<void> | null = null
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init() as unknown as Promise<void>
  return rapierReady
}

function colliderDescFor(shape: ShapeDef): RAPIER.ColliderDesc {
  switch (shape.type) {
    case 'sphere': return RAPIER.ColliderDesc.ball(shape.radius)
    case 'box': return RAPIER.ColliderDesc.cuboid(
      shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
    case 'cylinder': return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius)
  }
}

function bodyDescFor(def: RigidBodyDef): RAPIER.RigidBodyDesc {
  switch (def.kind) {
    case 'dynamic': return RAPIER.RigidBodyDesc.dynamic()
    case 'kinematic': return RAPIER.RigidBodyDesc.kinematicPositionBased()
    case 'fixed': return RAPIER.RigidBodyDesc.fixed()
  }
}

export async function createRapierPhysics(
  gravity: Vec3 = { x: 0, y: -9.81, z: 0 }
): Promise<PhysicsPort> {
  await initRapier()
  const world = new RAPIER.World(gravity)
  const eventQueue = new RAPIER.EventQueue(true)
  const bodies = new Map<object, RAPIER.RigidBody>()
  const entityByColliderHandle = new Map<number, object>()
  let gx = gravity.x, gy = gravity.y, gz = gravity.z

  return {
    get bodyCount() { return bodies.size },

    addBody(entity, def, pose) {
      if (bodies.has(entity)) return
      const body = world.createRigidBody(
        bodyDescFor(def)
          .setTranslation(pose.position.x, pose.position.y, pose.position.z)
          .setRotation(pose.rotation)
      )
      const colliderDesc = colliderDescFor(def.shape)
        .setSensor(def.sensor ?? false)
        .setFriction(def.friction ?? 0.5)
        .setRestitution(def.restitution ?? 0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      const collider = world.createCollider(colliderDesc, body)
      bodies.set(entity, body)
      entityByColliderHandle.set(collider.handle, entity)
    },

    removeBody(entity) {
      const body = bodies.get(entity)
      if (!body) return
      for (let i = 0; i < body.numColliders(); i++) {
        entityByColliderHandle.delete(body.collider(i).handle)
      }
      world.removeRigidBody(body)
      bodies.delete(entity)
    },

    setGravity(g) {
      if (g.x === gx && g.y === gy && g.z === gz) return
      gx = g.x; gy = g.y; gz = g.z
      world.gravity.x = g.x; world.gravity.y = g.y; world.gravity.z = g.z
      // Gravity is a force on every dynamic body; a body asleep at rest must wake
      // or it ignores the change (e.g. a respawned ball that settled before the
      // player tilts). Mirrors applyImpulse passing wakeUp=true. Unchanged gravity
      // is a no-op above, so idle bodies still sleep.
      for (const body of bodies.values()) body.wakeUp()
    },

    step(dt): PhysicsEvent[] {
      world.timestep = dt
      world.step(eventQueue)
      const events: PhysicsEvent[] = []
      eventQueue.drainCollisionEvents((handleA, handleB, started) => {
        const a = entityByColliderHandle.get(handleA)
        const b = entityByColliderHandle.get(handleB)
        if (!a || !b) return
        const colliderA = world.getCollider(handleA)
        const colliderB = world.getCollider(handleB)
        const sensor = (colliderA?.isSensor() ?? false) || (colliderB?.isSensor() ?? false)
        events.push({ kind: sensor ? 'sensor' : 'contact', started, a, b })
      })
      return events
    },

    readPose(entity): Pose | null {
      const body = bodies.get(entity)
      if (!body) return null
      const t = body.translation(), r = body.rotation()
      return { position: { x: t.x, y: t.y, z: t.z }, rotation: { x: r.x, y: r.y, z: r.z, w: r.w } }
    },

    readLinearVelocity(entity) {
      const body = bodies.get(entity)
      if (!body) return { x: 0, y: 0, z: 0 }
      const v = body.linvel()
      return { x: v.x, y: v.y, z: v.z }
    },

    applyImpulse(entity, impulse) {
      bodies.get(entity)?.applyImpulse(impulse, true)
    },

    setKinematicTarget(entity, position) {
      bodies.get(entity)?.setNextKinematicTranslation(position)
    },

    dispose() {
      bodies.clear()
      entityByColliderHandle.clear()
      world.free()
      eventQueue.free()
    }
  }
}
