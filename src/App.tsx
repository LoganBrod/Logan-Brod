import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Lobby } from './pages/Lobby'
import { Blackjack } from './pages/Blackjack'
import { Plinko } from './pages/Plinko'
import { Rewards } from './pages/Rewards'

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/blackjack" element={<Blackjack />} />
        <Route path="/plinko" element={<Plinko />} />
        <Route path="/rewards" element={<Rewards />} />
      </Routes>
    </AppLayout>
  )
}
