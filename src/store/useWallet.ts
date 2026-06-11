import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const STARTING_BALANCE = 1000

interface WalletState {
  balance: number
  lastDelta: number
  /** Apply the net result of a round (positive = profit, negative = loss, 0 = push). */
  settle: (net: number) => void
  resetBalance: () => void
}

export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      balance: STARTING_BALANCE,
      lastDelta: 0,

      settle: (net) =>
        set((state) => ({
          balance: Math.max(0, state.balance + net),
          lastDelta: net,
        })),

      resetBalance: () => set({ balance: STARTING_BALANCE, lastDelta: 0 }),
    }),
    { name: 'luckystack-wallet' },
  ),
)
