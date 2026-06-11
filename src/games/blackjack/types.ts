export type Suit = '♠' | '♥' | '♦' | '♣'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  id: string
  rank: Rank
  suit: Suit
}

export type Phase = 'betting' | 'player-turn' | 'dealer-turn' | 'settled'
export type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | null
