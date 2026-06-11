import { useCallback, useEffect, useRef, useState } from 'react'
import { useWallet } from '../../store/useWallet'
import { delay } from '../../lib/delay'
import { createShoe, RESHUFFLE_THRESHOLD } from './deck'
import { getHandValue, isBlackjack } from './hand'
import type { Card, Outcome, Phase } from './types'

export const BET_CHIPS = [5, 10, 25, 100, 250]
const DEFAULT_BET = 25
const DEALER_STAND = 17

export function useBlackjack() {
  const balance = useWallet((s) => s.balance)
  const settle = useWallet((s) => s.settle)

  const shoeRef = useRef<Card[]>(createShoe())

  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [dealerHand, setDealerHand] = useState<Card[]>([])
  const [bet, setBet] = useState(DEFAULT_BET)
  const [wager, setWager] = useState(0)
  const [phase, setPhase] = useState<Phase>('betting')
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [message, setMessage] = useState('Place your bet to start the round')
  const [revealDealer, setRevealDealer] = useState(false)

  const canEditBet = phase === 'betting' || phase === 'settled'

  const drawCard = useCallback((): Card => {
    if (shoeRef.current.length <= RESHUFFLE_THRESHOLD) {
      shoeRef.current = createShoe()
    }
    return shoeRef.current.pop()!
  }, [])

  const adjustBet = useCallback(
    (amount: number) => {
      if (!canEditBet) return
      setBet((current) => Math.min(balance, Math.max(0, current + amount)))
    },
    [canEditBet, balance],
  )

  const setMaxBet = useCallback(() => {
    if (!canEditBet) return
    setBet(Math.floor(balance))
  }, [canEditBet, balance])

  const halveBet = useCallback(() => {
    if (!canEditBet) return
    setBet((current) => Math.max(0, Math.floor(current / 2)))
  }, [canEditBet])

  const doubleBetAmount = useCallback(() => {
    if (!canEditBet) return
    setBet((current) => Math.min(balance, current * 2 || DEFAULT_BET))
  }, [canEditBet, balance])

  const clearBet = useCallback(() => {
    if (!canEditBet) return
    setBet(0)
  }, [canEditBet])

  const deal = useCallback(() => {
    if (!canEditBet) return
    if (bet <= 0 || bet > balance) return

    const p = [drawCard(), drawCard()]
    const d = [drawCard(), drawCard()]

    setPlayerHand(p)
    setDealerHand(d)
    setWager(bet)
    setOutcome(null)
    setRevealDealer(false)

    const playerBJ = isBlackjack(p)
    const dealerBJ = isBlackjack(d)

    if (playerBJ || dealerBJ) {
      setRevealDealer(true)
      if (playerBJ && dealerBJ) {
        setOutcome('push')
        setMessage('Both have Blackjack — bet returned')
        settle(0)
      } else if (playerBJ) {
        setOutcome('blackjack')
        setMessage('Blackjack! You win 3:2')
        settle(bet * 1.5)
      } else {
        setOutcome('lose')
        setMessage('Dealer has Blackjack')
        settle(-bet)
      }
      setPhase('settled')
      return
    }

    setPhase('player-turn')
    setMessage('Hit, stand, or double down')
  }, [canEditBet, bet, balance, drawCard, settle])

  const finishPlayerBust = useCallback(
    (finalWager: number) => {
      setRevealDealer(true)
      setOutcome('lose')
      setMessage('Bust! You lose')
      settle(-finalWager)
      setPhase('settled')
    },
    [settle],
  )

  const hit = useCallback(() => {
    if (phase !== 'player-turn') return
    const card = drawCard()
    const next = [...playerHand, card]
    setPlayerHand(next)

    const { value } = getHandValue(next)
    if (value > 21) {
      finishPlayerBust(wager)
    } else if (value === 21) {
      setRevealDealer(true)
      setPhase('dealer-turn')
      setMessage('Dealer is drawing…')
    }
  }, [phase, playerHand, drawCard, wager, finishPlayerBust])

  const stand = useCallback(() => {
    if (phase !== 'player-turn') return
    setRevealDealer(true)
    setPhase('dealer-turn')
    setMessage('Dealer is drawing…')
  }, [phase])

  const double = useCallback(() => {
    if (phase !== 'player-turn' || playerHand.length !== 2) return
    if (bet > balance) return

    const newWager = bet * 2
    setWager(newWager)

    const card = drawCard()
    const next = [...playerHand, card]
    setPlayerHand(next)

    const { value } = getHandValue(next)
    if (value > 21) {
      finishPlayerBust(newWager)
    } else {
      setRevealDealer(true)
      setPhase('dealer-turn')
      setMessage('Dealer is drawing…')
    }
  }, [phase, playerHand, bet, balance, drawCard, finishPlayerBust])

  // Dealer auto-play once the player stands, doubles, or hits to 21.
  useEffect(() => {
    if (phase !== 'dealer-turn') return
    let cancelled = false

    async function play() {
      await delay(700)
      let hand = dealerHand

      while (!cancelled) {
        const { value } = getHandValue(hand)
        if (value >= DEALER_STAND) break
        const card = drawCard()
        hand = [...hand, card]
        if (cancelled) return
        setDealerHand(hand)
        await delay(700)
      }

      if (cancelled) return

      const playerVal = getHandValue(playerHand).value
      const dealerVal = getHandValue(hand).value

      if (dealerVal > 21) {
        setOutcome('win')
        setMessage('Dealer busts — you win!')
        settle(wager)
      } else if (playerVal > dealerVal) {
        setOutcome('win')
        setMessage('You win!')
        settle(wager)
      } else if (playerVal < dealerVal) {
        setOutcome('lose')
        setMessage('Dealer wins')
        settle(-wager)
      } else {
        setOutcome('push')
        setMessage('Push — bet returned')
        settle(0)
      }
      setPhase('settled')
    }

    play()
    return () => {
      cancelled = true
    }
    // Intentionally only re-runs when `phase` flips to 'dealer-turn'; the
    // closed-over hand/wager values are the ones from that transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const playerValue = getHandValue(playerHand)
  const dealerValue = getHandValue(dealerHand)
  const dealerVisibleValue = revealDealer ? dealerValue : getHandValue(dealerHand.slice(0, 1))

  return {
    playerHand,
    dealerHand,
    bet,
    wager,
    balance,
    phase,
    outcome,
    message,
    revealDealer,
    playerValue,
    dealerValue,
    dealerVisibleValue,
    canDeal: canEditBet && bet > 0 && bet <= balance,
    canDouble: phase === 'player-turn' && playerHand.length === 2 && bet <= balance,
    canEditBet,
    isPlayerTurn: phase === 'player-turn',
    isSettled: phase === 'settled',
    adjustBet,
    setMaxBet,
    halveBet,
    doubleBetAmount,
    clearBet,
    deal,
    hit,
    stand,
    double,
  }
}

export type Blackjack = ReturnType<typeof useBlackjack>
export type { Outcome, Phase }
