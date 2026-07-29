import { describe, expect, it } from 'vitest'
import {
  createWalletState,
  deserializeWallet,
  earn,
  serializeWallet,
  spend
} from '../src/walletCore'

describe('walletCore', () => {
  it('seeds balance and totalEarned from the starting balance', () => {
    expect(createWalletState(5)).toEqual({ balance: 5, totalEarned: 5 })
  })

  it('earn credits balance and totalEarned; non-positive amounts are no-ops', () => {
    const earned = earn(createWalletState(0), 7)
    expect(earned).toEqual({ balance: 7, totalEarned: 7 })
    expect(earn(earned, 0)).toBe(earned)
  })

  it('spend debits balance only when affordable and never drops totalEarned', () => {
    const earned = earn(createWalletState(0), 10)
    expect(spend(earned, 4)).toEqual({
      ok: true,
      state: { balance: 6, totalEarned: 10 }
    })
    expect(spend(earned, 99)).toEqual({ ok: false, state: earned })
  })

  it('round-trips through serialize and deserialize', () => {
    const earned = earn(createWalletState(3), 5)
    expect(deserializeWallet(serializeWallet(earned))).toEqual(earned)
    expect(() => deserializeWallet({ balance: -1, totalEarned: 0 })).toThrow()
  })
})
