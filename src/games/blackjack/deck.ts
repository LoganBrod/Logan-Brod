import type { Card, Rank, Suit } from './types'

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

const NUM_DECKS = 4
/** Reshuffle once the shoe runs this low to keep odds roughly stable. */
export const RESHUFFLE_THRESHOLD = 20

export function createShoe(): Card[] {
  const shoe: Card[] = []
  for (let d = 0; d < NUM_DECKS; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ id: `${rank}${suit}-${d}`, rank, suit })
      }
    }
  }
  return shuffle(shoe)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
