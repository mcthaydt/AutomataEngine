import { describe, expect, it } from 'vitest'
import { createRapierPhysics } from '../../src/physics/rapier'
import type { PhysicsEvent } from '../../src/physics/port'
import { quat } from '../../src/math/quat'

const DT = 1 / 60
const at = (x: number, y: number, z: number) =>
  ({ position: { x, y, z }, rotation: quat.identity() })

function runUntil(
  physics: { step(dt: number): PhysicsEvent[] },
  predicate: (event: PhysicsEvent) => boolean,
  maxSteps = 240
): PhysicsEvent | null {
  for (let i = 0; i < maxSteps; i++) {
    const hit = physics.step(DT).find(predicate)
    if (hit) return hit
  }
  return null
}

describe('physics events', () => {
  it('emits a started contact with the entity references when a ball lands', async () => {
    const physics = await createRapierPhysics()
    const floor = { name: 'floor' }, ball = { name: 'ball' }
    physics.addBody(floor, {
      kind: 'fixed', shape: { type: 'box', halfExtents: { x: 5, y: 0.25, z: 5 } }
    }, at(0, -0.25, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 2, 0))

    const contact = runUntil(physics, (e) => e.kind === 'contact' && e.started)
    expect(contact).not.toBeNull()
    expect([contact!.a, contact!.b]).toContain(ball)
    expect([contact!.a, contact!.b]).toContain(floor)
    physics.dispose()
  })

  it('emits sensor events when a ball passes through a sensor (banana/goal pattern)', async () => {
    const physics = await createRapierPhysics()
    const sensor = { name: 'banana' }, ball = { name: 'ball' }
    physics.addBody(sensor, {
      kind: 'fixed', shape: { type: 'sphere', radius: 0.6 }, sensor: true
    }, at(0, 0.5, 0))
    physics.addBody(ball, { kind: 'dynamic', shape: { type: 'sphere', radius: 0.5 } }, at(0, 4, 0))

    const enter = runUntil(physics, (e) => e.kind === 'sensor' && e.started)
    expect(enter).not.toBeNull()
    expect([enter!.a, enter!.b]).toContain(sensor)
    expect([enter!.a, enter!.b]).toContain(ball)
    physics.dispose()
  })
})
