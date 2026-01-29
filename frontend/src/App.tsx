import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import MCPage from './pages/MCPage'
import PlayerPage from './pages/PlayerPage'
import ScreenPage from './pages/ScreenPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/mc/:code?" element={<MCPage />} />
      <Route path="/player/:code?" element={<PlayerPage />} />
      <Route path="/screen/:code" element={<ScreenPage />} />
    </Routes>
  )
}

export default App
