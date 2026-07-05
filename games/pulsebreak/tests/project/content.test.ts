import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadProjectFiles, validateProject } from '@automata/project'
import { pulsebreakProjectDefinition } from '../../src/project/definition'

const root = resolve(import.meta.dirname, '../../public/project')
const reader = { readText: (path: string) => readFile(resolve(root, path), 'utf8') }
const loadSnapshot = async () => (await loadProjectFiles(reader)).snapshot

describe('Pulsebreak project content', () => {
  it('loads all six public project files into a valid snapshot', async () => {
    const snapshot = await loadSnapshot()
    expect(snapshot.manifest.gameId).toBe('pulsebreak')
    expect(Object.keys(snapshot.scenes)).toEqual(['arena'])
    expect(snapshot.manifest.resources).toHaveLength(4)
    expect(validateProject(pulsebreakProjectDefinition, snapshot)).toEqual([])
  })

  it('has one player start, one ordinary spawn zone, and one boss zone', async () => {
    const snapshot = await loadSnapshot()
    const entities = snapshot.scenes.arena!.entities
    expect(entities.filter((entity) => entity.components.some((component) => component.typeId === 'pulsebreak.player-start'))).toHaveLength(1)
    const zones = entities.filter((entity) => entity.components.some((component) => component.typeId === 'pulsebreak.spawn-zone'))
    expect(zones.map((zone) => zone.id).sort()).toEqual(['boss-north', 'enemy-ring'])
  })
})

describe('Pulsebreak project definition', () => {
  function snapshotWith(mutate: (snapshot: Awaited<ReturnType<typeof loadSnapshot>>) => void) {
    return (async () => { const snapshot = await loadSnapshot(); mutate(snapshot); return snapshot })()
  }
  const codes = (snapshot: Awaited<ReturnType<typeof loadSnapshot>>) => validateProject(pulsebreakProjectDefinition, snapshot).map((issue) => issue.code)

  it('flags a missing player start', async () => {
    const snapshot = await snapshotWith((s) => {
      s.scenes.arena!.entities = s.scenes.arena!.entities.filter((entity) => entity.id !== 'player-start')
    })
    expect(codes(snapshot)).toContain('pulsebreak.playerStart')
  })

  it('flags a wave that references an unknown enemy and a non-positive zone weight', async () => {
    const unknown = await snapshotWith((s) => {
      const waves = (s.resources.waves!.data as { waves: Array<{ spawns: Array<{ enemyTypeId: string }> }> }).waves
      waves[0]!.spawns[0]!.enemyTypeId = 'ghost'
    })
    expect(codes(unknown)).toContain('pulsebreak.waveEnemy')

    const weight = await snapshotWith((s) => {
      const zone = s.scenes.arena!.entities.find((entity) => entity.id === 'enemy-ring')!.components.find((component) => component.typeId === 'pulsebreak.spawn-zone')!
      ;(zone.data as { weight: number }).weight = 0
    })
    expect(codes(weight)).toContain('pulsebreak.zoneWeight')
  })

  it('flags an enemy type the runtime cannot spawn', async () => {
    const snapshot = await snapshotWith((s) => {
      const enemies = (s.resources.enemies!.data as { enemies: Array<Record<string, unknown>> }).enemies
      enemies.push({ id: 'tank', health: 10, radius: 1, speed: 1, contactDamage: 1, scoreValue: 1, color: '#ffffff' })
    })
    expect(codes(snapshot)).toContain('pulsebreak.enemyKind')
  })

  it('flags a final wave without a boss', async () => {
    const snapshot = await snapshotWith((s) => {
      const waves = (s.resources.waves!.data as { waves: Array<{ spawns: Array<{ enemyTypeId: string; count: number }> }> }).waves
      waves[waves.length - 1]!.spawns = [{ enemyTypeId: 'rammer', count: 1 }]
    })
    expect(codes(snapshot)).toContain('pulsebreak.finalBoss')
  })
})
