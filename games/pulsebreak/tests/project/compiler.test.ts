import { describe, expect, it } from 'vitest'
import { ARENA, CAMERA, ENEMY, PLAYER, PROJECTILE_LIFETIME_S, UPGRADE_STEP, WAVES } from '../../src/config'
import { UPGRADES } from '../../src/sim/upgrades'
import { pulsebreakProjectDefinition } from '../../src/project/definition'
import { createPulsebreakTemplate } from '../../src/project/template'

describe('Pulsebreak project compiler', () => {
  const compiled = pulsebreakProjectDefinition.compile(createPulsebreakTemplate())

  it('reproduces every authored constant exactly', () => {
    expect(compiled.arena).toEqual(ARENA)
    expect(compiled.camera).toEqual(CAMERA)
    expect(compiled.player).toEqual(PLAYER)
    expect(compiled.enemy).toEqual(ENEMY)
    expect(compiled.waves).toEqual(WAVES)
    expect(compiled.upgrades).toEqual(UPGRADES)
    expect(compiled.upgradeStep).toEqual(UPGRADE_STEP)
    expect(compiled.projectileLifetimeS).toBe(PROJECTILE_LIFETIME_S)
  })

  it('compiles the floor render seed, player start, and zones ordered by entity ID', () => {
    expect(compiled.floor).toEqual({ position: { x: 0, y: -0.15, z: 0 }, size: { x: 28, y: 0.3, z: 28 }, color: '#0a1124' })
    expect(compiled.player.spawn).toEqual({ x: 0, y: 0.5, z: 0 })
    expect(compiled.spawnZones.map((zone) => zone.id)).toEqual(['boss-north', 'enemy-ring'])
    expect(compiled.spawnZones[1]).toMatchObject({ mode: 'ring', radius: 13, center: { x: 0, y: 0.5, z: 0 }, enemyTypeIds: ['rammer', 'shooter'], angleJitterRad: 0.35 })
  })
})
