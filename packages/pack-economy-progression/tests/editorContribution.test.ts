import { describe, expect, it } from 'vitest'
import { economyProgressionEditorContribution } from '../src/editorContribution'

describe('economyProgressionEditorContribution', () => {
  it('has no prefabs because its entities are composition-owned', () => {
    expect(economyProgressionEditorContribution.prefabs).toEqual([])
    expect(economyProgressionEditorContribution.packId)
      .toBe('economy-progression')
  })

  it('adds and disposes preview entities', () => {
    const added: string[] = []
    const removed: string[] = []
    const render = {
      add: (entity: { id: string }) => { added.push(entity.id) },
      setPose: () => {},
      remove: (entity: { id: string }) => { removed.push(entity.id) }
    }
    const config = {
      wallet: { startingBalance: 5 },
      pickups: [{
        id: 'currency-1',
        position: { x: 1, z: 1 },
        amount: 5
      }],
      shops: [{
        id: 'shop-1',
        position: { x: 2, z: 2 },
        radius: 1.5,
        stock: []
      }],
      bounty: { perEnemy: 3 },
      questReward: { perQuest: 6 },
      progression: { milestones: [{ id: 'm1', threshold: 5 }] }
    }

    const preview =
      economyProgressionEditorContribution.createPreview!(
        config,
        render as never
      )

    expect(added.length).toBeGreaterThan(0)
    preview.dispose()
    expect(removed).toHaveLength(added.length)
  })

  it('rejects config outside the pack schema', () => {
    const render = {
      add: () => {},
      setPose: () => {},
      remove: () => {}
    }
    expect(() =>
      economyProgressionEditorContribution.createPreview!(
        { bogus: true },
        render as never
      )
    ).toThrow()
  })
})
