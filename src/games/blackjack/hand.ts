import type { Card } from './types'

export function getHandValue(cards: Card[]): { value: number; soft: boolean } {
  let total = 0
  let aces = 0

  for (const card of cards) {
    if (card.rank === 'A') {
      total += 11
      aces += 1
    } else if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === '10') {
      total += 10
    } else {
      total += Number(card.rank)
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }

  return { value: total, soft: aces > 0 }
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && getHandValue(cards).value === 21
}

export function isBust(cards: Card[]): boolean {
  return getHandValue(cards).value > 21
}
