import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getGame, getScoreboard, Game, Player } from '../api'
import { useSocket } from '../hooks/useSocket'

export default function ScreenPage() {
  const { code } = useParams<{ code: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [scoreboard, setScoreboard] = useState<Player[]>([])

  // WebSocket (mode écran public, pas de token auth nécessaire)
  const socketEnabled = Boolean(code)
  const socket = useSocket(socketEnabled ? { code: code!, token: 'public', role: 'screen' } : { code: 'disabled', token: 'disabled', role: 'screen' })

  useEffect(() => {
    if (!code) return
    loadData()
  }, [code])

  useEffect(() => {
    if (!socketEnabled || !socket) return

    socket.on('game:state', (data: any) => {
      setGame(data)
    })

    socket.on('scoreboard:updated', (data: any) => {
      setScoreboard(data.players)
    })

    socket.on('buzz:winner', (data: any) => {
      // Afficher animation
    })
  }, [socket, socketEnabled])

  async function loadData() {
    if (!code) return
    try {
      const [g, scores] = await Promise.all([
        getGame(code),
        getScoreboard(code),
      ])
      setGame(g)
      setScoreboard(scores)
    } catch (err) {
      console.error(err)
    }
  }

  if (!game) {
    return <div style={{ padding: '20px' }}>Chargement...</div>
  }

  const currentQuestion = game.questions[game.currentQuestionIndex]

  return (
    <div style={{ padding: '40px', textAlign: 'center', fontSize: '24px' }}>
      <h1 style={{ fontSize: '48px' }}>QuizBuzzer</h1>
      <h2 style={{ fontSize: '36px' }}>Code: {code}</h2>

      {game.status === 'LOBBY' && (
        <div style={{ marginTop: '50px' }}>
          <p style={{ fontSize: '32px' }}>⏳ En attente du démarrage...</p>
          <h3>Joueurs connectés ({game.players.length})</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {game.players.map(p => (
              <li key={p.id} style={{ fontSize: '28px', margin: '10px 0' }}>
                {p.name} {p.isConnected ? '🟢' : '🔴'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {game.status === 'RUNNING' && (
        <div>
          <h3 style={{ marginTop: '40px' }}>
            Question {game.currentQuestionIndex + 1} / {game.questions.length}
          </h3>

          {currentQuestion && (
            <div style={{
              fontSize: '32px',
              margin: '30px auto',
              padding: '30px',
              border: '3px solid #333',
              maxWidth: '800px'
            }}>
              {currentQuestion.text}
            </div>
          )}

          <div style={{ marginTop: '50px' }}>
            <h2>🏆 Classement</h2>
            <table border={2} cellPadding={15} style={{ margin: '0 auto', fontSize: '24px' }}>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Joueur</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {game.players.sort((a, b) => b.score - a.score).map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {game.status === 'FINISHED' && (
        <div style={{ marginTop: '50px' }}>
          <h2 style={{ fontSize: '48px' }}>Partie terminée !</h2>
          <h3>Classement final</h3>
          <table border={2} cellPadding={15} style={{ margin: '0 auto', fontSize: '28px' }}>
            <thead>
              <tr>
                <th></th>
                <th>Joueur</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {game.players.sort((a, b) => b.score - a.score).map((p, i) => (
                <tr key={p.id}>
                  <td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}</td>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
