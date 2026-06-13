import {
  GameLoop, Scheduler, createTransform, createWorld, registerRenderables,
  renderSystem, type EngineEntity, type RenderPort
} from '@automata/engine'

export interface DemoScene { loop: GameLoop }

/** Pre-gameplay demo: a floor + ball under a gently wobbling stage group. */
export function createDemoScene(port: RenderPort, onRender?: () => void): DemoScene {
  const world = createWorld<EngineEntity>()
  const stage = port.createGroup()
  registerRenderables(world, port, stage)

  world.add({
    transform: createTransform({ x: 0, y: -0.25, z: 0 }),
    renderable: { primitive: 'box', size: { x: 8, y: 0.5, z: 16 }, color: '#7ec850' }
  })
  world.add({
    transform: createTransform({ x: 0, y: 0.5, z: 0 }),
    renderable: { primitive: 'sphere', radius: 0.5, color: '#ff5964' }
  })
  port.setCamera({ x: 0, y: 6, z: 12 }, { x: 0, y: 0, z: 0 })

  type Ctx = { world: typeof world; dt: number; alpha: number }
  const scheduler = new Scheduler<Ctx>()
  let elapsed = 0
  scheduler.add({
    name: 'wobble',
    stage: 'update',
    run(ctx) {
      elapsed += ctx.dt
      port.setGroupRotation(stage, { x: Math.sin(elapsed) * 0.08, y: 0, z: Math.cos(elapsed) * 0.08 })
    }
  })

  const loop = new GameLoop({
    fixedUpdate: (dt) => scheduler.runFixed({ world, dt, alpha: 0 }),
    render: (alpha) => {
      scheduler.runStage('render', { world, dt: 0, alpha })
      onRender?.()
    }
  })
  scheduler.add(renderSystem(port))
  return { loop }
}
