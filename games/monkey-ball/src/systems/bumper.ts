import { vec3, type EventQueue, type PhysicsPort, type System } from '@automata/engine'
import type { GameCtx } from '../game/context'
import { ballPartner, type PairEvent } from './pairing'

/** Ball-bumper contact creates a horizontal radial impulse away from the bumper. */
export function createBumper(physics: PhysicsPort, events: EventQueue): System<GameCtx> {
  return {
    name: 'bumper',
    stage: 'postPhysics',
    run() {
      for (const event of events.read<PairEvent>('contactStart')) {
        const bumper = ballPartner(event, 'bumper')
        if (!bumper) continue
        const ball = event.a === bumper ? event.b : event.a
        if (!ball.transform || !bumper.transform) continue
        const away = vec3.sub(ball.transform.position, bumper.transform.position)
        const dir = vec3.normalize({ x: away.x, y: 0, z: away.z })
        physics.applyImpulse(ball, vec3.scale(dir, bumper.bumper!.impulseStrength))
      }
    }
  }
}
