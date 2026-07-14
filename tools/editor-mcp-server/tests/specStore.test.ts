import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSpec } from '@automata/contracts'
import { gameSpecPath, readGameSpec, writeGameSpec } from '../src/specStore'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
function fixtureSpec(): GameSpec { return { specVersion: 1, provenance: { prompt: 'p', translations: [], history: [{ version: 1, reason: 'initial compile' }] }, identity: { id: 'probe', title: 'Probe', logline: 'L', themes: ['t'], contentRating: 'everyone' }, direction: { visualStyle: 'v', audioStyle: 'a', dialogueTone: 'd', camera: 'fixed' }, budgets: { targetMinutes: 60, districtCount: 1, interiorCount: 1, characterCount: 2, mainQuestCount: 1, sideQuestCount: 0, enemyTypeCount: 0, assetBudget: 2, buildTimeMinutes: 30 }, capabilities: [{ id: 'interaction-inventory', config: {}, requirements: [] }], world: { locations: [{ id: 'hub', name: 'Hub', kind: 'district', description: 'D' }] }, cast: [{ id: 'player', name: 'P', role: 'player', description: 'D' }], story: { premise: 'P', beats: [{ id: 'b1', kind: 'beginning', summary: 'S' }, { id: 'b2', kind: 'ending', summary: 'E' }], quests: [{ id: 'q1', kind: 'main', summary: 'S' }] }, progression: { milestones: [{ id: 'm1', summary: 'S' }] }, assets: [], acceptance: [{ id: 'a1', description: 'D', kind: 'structural', target: 'T' }] } }
describe('specStore', () => {
  it('round-trips a spec and returns null when absent', async () => { const root = await mkdtemp(join(tmpdir(), 'spec-store-')); roots.push(root); await mkdir(join(root, 'games/probe'), { recursive: true }); expect(await readGameSpec(root, 'probe')).toBeNull(); await writeGameSpec(root, 'probe', fixtureSpec()); expect(gameSpecPath(root, 'probe')).toBe(join(root, 'games/probe/gamespec.json')); expect(await readGameSpec(root, 'probe')).toEqual(fixtureSpec()); expect((await readFile(gameSpecPath(root, 'probe'), 'utf8')).endsWith('\n')).toBe(true) })
  it('throws on a corrupt gamespec.json rather than returning garbage', async () => { const root = await mkdtemp(join(tmpdir(), 'spec-store-')); roots.push(root); await mkdir(join(root, 'games/probe'), { recursive: true }); await writeFile(gameSpecPath(root, 'probe'), '{"not":"a spec"}'); await expect(readGameSpec(root, 'probe')).rejects.toThrow() })
  it('only maps a missing file to null, preserving other filesystem failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spec-store-'))
    roots.push(root)
    await mkdir(gameSpecPath(root, 'probe'), { recursive: true })
    await expect(readGameSpec(root, 'probe')).rejects.toThrow()
  })
})
