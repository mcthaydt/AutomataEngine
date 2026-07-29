import { z } from '@automata/project'

/** Pure currency arithmetic. `totalEarned` is monotonic—the progression signal. */
export interface WalletState {
  balance: number
  totalEarned: number
}

export function createWalletState(startingBalance: number): WalletState {
  return { balance: startingBalance, totalEarned: startingBalance }
}

export function earn(state: WalletState, amount: number): WalletState {
  if (amount <= 0) return state
  return {
    balance: state.balance + amount,
    totalEarned: state.totalEarned + amount
  }
}

export interface SpendResult {
  ok: boolean
  state: WalletState
}

export function spend(state: WalletState, amount: number): SpendResult {
  if (amount <= 0 || state.balance < amount) return { ok: false, state }
  return {
    ok: true,
    state: {
      balance: state.balance - amount,
      totalEarned: state.totalEarned
    }
  }
}

export const savedWalletSchema = z.strictObject({
  balance: z.number().int().min(0),
  totalEarned: z.number().int().min(0)
})

export function serializeWallet(state: WalletState): unknown {
  return { balance: state.balance, totalEarned: state.totalEarned }
}

export function deserializeWallet(raw: unknown): WalletState {
  return savedWalletSchema.parse(raw)
}
