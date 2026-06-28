import { describe, expect, it } from 'vitest'
import { planNewGame } from '../src/plan'

describe('planNewGame', () => {
  it('emits the standard game package files', () => {
    const paths = planNewGame('starfall', 5177).files.map((f) => f.path)
    expect(paths).toEqual(expect.arrayContaining([
      'games/starfall/package.json',
      'games/starfall/tsconfig.json',
      'games/starfall/vite.config.ts',
      'games/starfall/vitest.config.ts',
      'games/starfall/index.html',
      'games/starfall/src/main.ts',
      'games/starfall/src/index.ts',
      'games/starfall/src/vite-env.d.ts'
    ]))
  })

  it('wires the game name, kit dependency, and vitest project name', () => {
    const files = planNewGame('starfall', 5177).files
    const pkg = files.find((f) => f.path.endsWith('package.json'))!.content
    expect(pkg).toContain('"name": "starfall"')
    expect(pkg).toContain('"@automata/game-kit": "*"')
    expect(pkg).toContain('"@automata/engine": "*"')
    const vitest = files.find((f) => f.path.endsWith('vitest.config.ts'))!.content
    expect(vitest).toContain("name: 'starfall'")
  })

  it('carries validated wiring inputs in the plan', () => {
    expect(planNewGame('starfall', 5188)).toMatchObject({ name: 'starfall', port: 5188 })
  })

  it('defaults the dev-server port to 5177 when none is given', () => {
    expect(planNewGame('starfall').port).toBe(5177)
  })

  it.each(['../outside', '../../outside', 'bad/name', "bad'name", 'Uppercase'])(
    'rejects unsafe game name %s',
    (name) => {
      expect(() => planNewGame(name)).toThrow(/game name/i)
    }
  )

  it.each([Number.NaN, 0, -1, 5177.5, 65_536])('rejects invalid port %s', (port) => {
    expect(() => planNewGame('starfall', port)).toThrow(/port/i)
  })
})
