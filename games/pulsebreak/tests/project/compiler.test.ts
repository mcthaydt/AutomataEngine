import { describe, expect, it } from 'vitest'
import { pulsebreakProjectDefinition } from '../../src/project/definition'
import { createPulsebreakTemplate, defaultPulsebreakCompiledProject } from '../../src/project/template'

describe('Pulsebreak project compiler', () => {
  const compiled = pulsebreakProjectDefinition.compile(createPulsebreakTemplate())

  it('reproduces every authored constant exactly', () => {
    expect(compiled).toEqual(defaultPulsebreakCompiledProject)
    expect(compiled.arena).toEqual({ half: 13, y: 0.5 })
    expect(compiled.waves).toEqual([
      { rammer: 3, shooter: 0, boss: 0 },
      { rammer: 3, shooter: 1, boss: 0 },
      { rammer: 4, shooter: 2, boss: 0 },
      { rammer: 5, shooter: 3, boss: 0 },
      { rammer: 0, shooter: 0, boss: 1 }
    ])
    expect(compiled.projectileLifetimeS).toBe(3)
  })

  it('scales the floor primitive size by the floor entity world scale', () => {
    const snapshot = createPulsebreakTemplate()
    const scene = snapshot.scenes[snapshot.manifest.entrySceneId]!
    const floor = scene.entities.find((entity) => entity.components.some((c) => c.typeId === 'core.primitive'))!
    const base = { ...(floor.components.find((c) => c.typeId === 'core.primitive')!.data as { size: { x: number; y: number; z: number } }).size }
    const transform = floor.components.find((c) => c.typeId === 'core.transform')!
    ;(transform.data as { scale: { x: number; y: number; z: number } }).scale = { x: 2, y: 3, z: 4 }

    const scaled = pulsebreakProjectDefinition.compile(snapshot)
    expect(scaled.floor.size).toEqual({ x: base.x * 2, y: base.y * 3, z: base.z * 4 })
  })

  it('compiles the floor render seed, player start, and zones ordered by entity ID', () => {
    expect(compiled.floor).toEqual({ position: { x: 0, y: -0.15, z: 0 }, size: { x: 28, y: 0.3, z: 28 }, color: '#0a1124' })
    expect(compiled.player.spawn).toEqual({ x: 0, y: 0.5, z: 0 })
    expect(compiled.spawnZones.map((zone) => zone.id)).toEqual(['boss-north', 'enemy-ring'])
    expect(compiled.spawnZones[1]).toMatchObject({ mode: 'ring', radius: 13, center: { x: 0, y: 0.5, z: 0 }, enemyTypeIds: ['rammer', 'shooter'], angleJitterRad: 0.35 })
  })
})
