import { useCallback, useState } from 'react'
import { useWallet } from '../../store/useWallet'
import { MULTIPLIER_TABLES, ROW_OPTIONS, type RiskLevel, type RowCount } from './multipliers'

export const PLINKO_BET_CHIPS = [1, 5, 10, 50, 100]
const DEFAULT_BET = 10

export interface DropResult {
  id: number
  multiplier: number
  net: number
  bet: number
}

export function usePlinko() {
  const balance = useWallet((s) => s.balance)
  const settle = useWallet((s) => s.settle)

  const [bet, setBet] = useState(DEFAULT_BET)
  const [rows, setRows] = useState<RowCount>(16)
  const [risk, setRisk] = useState<RiskLevel>('medium')
  const [activeBalls, setActiveBalls] = useState(0)
  const [inFlight, setInFlight] = useState(0)
  const [history, setHistory] = useState<DropResult[]>([])
  const [resultId, setResultId] = useState(0)

  const multipliers = MULTIPLIER_TABLES[rows][risk]
  const canEditRows = activeBalls === 0
  const canDrop = bet > 0 && bet <= balance - inFlight

  const adjustBet = useCallback(
    (amount: number) => setBet((current) => Math.min(balance - inFlight, Math.max(0, current + amount))),
    [balance, inFlight],
  )

  const setMaxBet = useCallback(() => setBet(Math.max(0, Math.floor(balance - inFlight))), [balance, inFlight])

  const halveBet = useCallback(() => setBet((current) => Math.max(0, Math.floor(current / 2))), [])

  const doubleBetAmount = useCallback(
    () => setBet((current) => Math.min(balance - inFlight, current * 2 || DEFAULT_BET)),
    [balance, inFlight],
  )

  const clearBet = useCallback(() => setBet(0), [])

  const beginDrop = useCallback(() => {
    if (!canDrop) return null
    const wager = bet
    setInFlight((v) => v + wager)
    setActiveBalls((v) => v + 1)
    return { wager, multipliers }
  }, [canDrop, bet, multipliers])

  const finishDrop = useCallback(
    (bucket: number, wager: number, table: number[]) => {
      const multiplier = table[bucket]
      const net = wager * multiplier - wager
      settle(net)
      setInFlight((v) => Math.max(0, v - wager))
      setActiveBalls((v) => Math.max(0, v - 1))
      setHistory((h) => [{ id: Date.now() + Math.random(), multiplier, net, bet: wager }, ...h].slice(0, 8))
      setResultId((id) => id + 1)
    },
    [settle],
  )

  return {
    bet,
    rows,
    risk,
    multipliers,
    balance,
    activeBalls,
    inFlight,
    history,
    resultId,
    canEditRows,
    canDrop,
    rowOptions: ROW_OPTIONS,
    setRows: (value: RowCount) => canEditRows && setRows(value),
    setRisk,
    adjustBet,
    setMaxBet,
    halveBet,
    doubleBetAmount,
    clearBet,
    beginDrop,
    finishDrop,
  }
}
