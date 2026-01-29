import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { joinGame, getGame, JoinGameResponse, Game } from '../api'
import { useSocket } from '../hooks/useSocket'

export default function PlayerPage() {
  const { code: urlCode } = useParams()
  const navigate = useNavigate()

  const [step, setStep] = useState<'join' | 'waiting' | 'playing'>('join')
  const [code, setCode] = useState(urlCode || '')
  const [name, setName] = useState('')
  const [playerData, setPlayerData] = useState<JoinGameResponse | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState('')
  const [buzzDisabled, setBuzzDisabled] = useState(false)
  const [message, setMessage] = useState('')

  const playerToken = playerData?.playerToken || localStorage.getItem(`playerToken_${code}`) || ''


  const socketEnabled = Boolean(code && playerToken)
  const socket = useSocket(socketEnabled ? { code, token: playerToken, role: 'player' } : { code: 'disabled', token: 'disabled', role: 'player' })

  useEffect(() => {
    if (urlCode && localStorage.getItem(`playerToken_${urlCode}`)) {
      setCode(urlCode)
      loadPlayerSession(urlCode)
    }
  }, [urlCode])

  // Surveiller les changements de statut du jeu
  useEffect(() => {
    if (!game) return
    
    console.log('Game status changed to:', game.status, 'Current step:', step)
    
    if (game.status === 'RUNNING' && step === 'waiting') {
      console.log('Switching to playing mode')
      setStep('playing')
    } else if (game.status === 'FINISHED' && step !== 'playing') {
      setStep('playing') // On reste sur 'playing' qui gère aussi l'écran de fin
    }
  }, [game?.status])

  useEffect(() => {
    if (!socketEnabled || !socket) return

    socket.on('game:state', (data: any) => {
      console.log('Player received game state:', data)
      // Fusionner avec game existant pour garder les questions
      setGame(prevGame => ({
        ...data,
        questions: data.questions || prevGame?.questions || [],
        players: data.players || prevGame?.players || [],
      }))
    })

    socket.on('question:opened', () => {
      setBuzzDisabled(false)
      setMessage('🟢 Buzz ouvert ! Appuyez sur le bouton !')
    })

    socket.on('question:reopened', () => {
      setBuzzDisabled(false)
      setMessage('🟢 Buzz réouvert !')
    })

    socket.on('buzz:winner', (data: any) => {
      if (data.playerId === playerData?.playerId) {
        setMessage(`🎉 Vous avez buzzé en premier ! Répondez maintenant.`)
        setBuzzDisabled(true)
      } else {
        setMessage(`❌ ${data.playerName} a buzzé avant vous`)
        setBuzzDisabled(true)
      }
    })

    socket.on('buzz:rejected', (data: any) => {
      setMessage(`❌ ${data.reason}`)
      setBuzzDisabled(true)
    })

    socket.on('buzz:correct', (data: any) => {
      if (data.playerId === playerData?.playerId) {
        setMessage(`✅ Bonne réponse ! +${data.points} pts`)
      }
      setBuzzDisabled(true)
    })

    socket.on('buzz:wrong', (data: any) => {
      if (data.playerId === playerData?.playerId) {
        setMessage(`❌ Mauvaise réponse. Vous êtes bloqué pour cette question.`)
      }
      setBuzzDisabled(true)
    })

    socket.on('player:locked', (data: any) => {
      if (data.playerId === playerData?.playerId) {
        setBuzzDisabled(true)
      }
    })

    socket.on('question:changed', () => {
      setMessage('➡️ Question suivante...')
      setBuzzDisabled(true)
    })
  }, [socket, socketEnabled, playerData])

  async function loadPlayerSession(gameCode: string) {
    try {
      const storedToken = localStorage.getItem(`playerToken_${gameCode}`)
      const storedPlayerId = localStorage.getItem(`playerId_${gameCode}`)
      const storedName = localStorage.getItem(`playerName_${gameCode}`)
      
      console.log('Loading player session:', { gameCode, storedToken, storedPlayerId, storedName })
      
      if (storedToken && storedPlayerId) {
        setPlayerData({
          playerToken: storedToken,
          playerId: storedPlayerId,
          name: storedName || '',
          gameCode: gameCode,
        })
      }
      
      const g = await getGame(gameCode)
      setGame(g)
      setStep(g.status === 'LOBBY' ? 'waiting' : 'playing')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleJoin() {
    try {
      setError('')
      
      if (!code.trim()) {
        setError('Entrez un code de partie')
        return
      }
      
      if (!name.trim()) {
        setError('Entrez votre nom')
        return
      }

      const data = await joinGame(code.toUpperCase(), name)
      setPlayerData(data)
      localStorage.setItem(`playerToken_${data.gameCode}`, data.playerToken)
      localStorage.setItem(`playerId_${data.gameCode}`, data.playerId)
      localStorage.setItem(`playerName_${data.gameCode}`, name)
      console.log('Player joined and saved:', { playerId: data.playerId, playerToken: data.playerToken, name })
      navigate(`/player/${data.gameCode}`)
      setStep('waiting')
    } catch (err: any) {
      setError(err.message)
    }
  }

  function handleBuzz() {
    if (!socket || !game || buzzDisabled) return
    
    // Utiliser currentQuestion du gameState WebSocket si disponible
    let currentQuestion = socket.gameState?.currentQuestion
    
    // Sinon, essayer depuis game.questions
    if (!currentQuestion && game.questions) {
      currentQuestion = game.questions[game.currentQuestionIndex]
    }
    
    if (!currentQuestion || !currentQuestion.id) {
      console.error('No current question available', { gameState: socket.gameState, game })
      return
    }

    setBuzzDisabled(true)
    
    const buzzData = {
      questionId: currentQuestion.id,
      clientTimestamp: new Date().toISOString(),
    }
    
    console.log('Emitting player:buzz with data:', buzzData)
    
    socket.emit('player:buzz', buzzData, (response: any) => {
      console.log('player:buzz response:', response)
      if (!response.success) {
        alert(`Erreur: ${response.error}`)
        setBuzzDisabled(false)
      }
    })
  }

  // === STEP 1: Join ===
  if (step === 'join') {
    return (
      <div style={{ padding: '20px' }}>
        <h1>🎮 Rejoindre une partie</h1>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <div style={{ marginTop: '20px' }}>
          <label>Code de la partie:</label><br />
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Ex: AB12CD"
            style={{ padding: '10px', fontSize: '18px', width: '200px' }}
          />
        </div>

        <div style={{ marginTop: '15px' }}>
          <label>Votre nom:</label><br />
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Alice"
            style={{ padding: '10px', fontSize: '18px', width: '200px' }}
          />
        </div>

        <button
          onClick={handleJoin}
          style={{ marginTop: '20px', fontSize: '18px', padding: '10px 20px' }}
        >
          ✅ Rejoindre
        </button>
      </div>
    )
  }

  // === STEP 2: Waiting ===
  if (step === 'waiting') {
    return (
      <div style={{ padding: '20px' }}>
        <h1>🎮 En attente...</h1>
        <p>Bienvenue <strong>{playerData?.name}</strong> !</p>
        <p>Code de la partie: <strong>{code}</strong></p>

        <h3>Joueurs connectés:</h3>
        <ul>
          {game?.players.map(p => (
            <li key={p.id}>{p.name} {p.isConnected ? '🟢' : '🔴'}</li>
          ))}
        </ul>

        <p style={{ fontSize: '20px', marginTop: '30px' }}>⏳ En attente que le MC démarre...</p>
      </div>
    )
  }

  // === STEP 3: Playing ===
  if (step === 'playing') {
    const currentQuestion = game?.questions?.[game?.currentQuestionIndex || 0]
    const player = game?.players?.find(p => p.id === playerData?.playerId)

    // Si le jeu est terminé, afficher l'écran de fin
    if (game?.status === 'FINISHED') {
      const sortedPlayers = [...(game?.players || [])].sort((a, b) => b.score - a.score)
      const playerRank = sortedPlayers.findIndex(p => p.id === playerData?.playerId) + 1
      
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h1>🏁 Quiz terminé !</h1>
          
          <div style={{ 
            margin: '20px auto', 
            padding: '20px',
            backgroundColor: playerRank === 1 ? '#FFD700' : playerRank === 2 ? '#C0C0C0' : playerRank === 3 ? '#CD7F32' : '#f5f5f5',
            borderRadius: '10px',
            maxWidth: '400px'
          }}>
            <h2>
              {playerRank === 1 ? '🥇' : playerRank === 2 ? '🥈' : playerRank === 3 ? '🥉' : ''}
              {' '}{playerData?.name}
            </h2>
            <p style={{ fontSize: '32px', fontWeight: 'bold' }}>
              {player?.score || 0} points
            </p>
            <p style={{ fontSize: '24px', color: '#666' }}>
              {playerRank === 1 ? 'Champion !' : `${playerRank}${playerRank === 1 ? 'er' : 'ème'} place`}
            </p>
          </div>

          <div style={{ 
            margin: '40px auto', 
            maxWidth: '600px',
            backgroundColor: '#f5f5f5',
            padding: '30px',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginBottom: '30px' }}>🏆 Classement Final</h2>
            
            {sortedPlayers.map((p, index) => (
              <div 
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '15px 20px',
                  margin: '10px 0',
                  backgroundColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : 'white',
                  borderRadius: '8px',
                  fontSize: '20px',
                  fontWeight: p.id === playerData?.playerId ? 'bold' : 'normal',
                  border: p.id === playerData?.playerId ? '3px solid #2196F3' : 'none',
                }}
              >
                <span>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`} {p.name}
                </span>
                <span style={{ fontSize: '24px' }}>{p.score} pts</span>
              </div>
            ))}
          </div>

          <button 
            onClick={() => {
              navigate('/')
            }}
            style={{ 
              fontSize: '20px', 
              padding: '15px 30px', 
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              marginTop: '20px'
            }}
          >
            🏠 Retour à l'accueil
          </button>
        </div>
      )
    }

    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>🎮 {playerData?.name}</h1>
        <h2>Score: {player?.score || 0}</h2>

        <div style={{ marginTop: '30px' }}>
          <h3>Question {(game?.currentQuestionIndex || 0) + 1} / {game?.questions?.length || 0}</h3>
          
          {currentQuestion && (
            <div style={{ fontSize: '24px', margin: '20px 0', padding: '20px', border: '2px solid #333' }}>
              {currentQuestion.text}
            </div>
          )}

          {message && (
            <div style={{
              padding: '15px',
              marginBottom: '20px',
              backgroundColor: message.includes('✅') ? '#d4edda' : message.includes('❌') ? '#f8d7da' : '#d1ecf1',
              fontSize: '20px'
            }}>
              {message}
            </div>
          )}

          <button
            onClick={handleBuzz}
            disabled={buzzDisabled}
            style={{
              fontSize: '48px',
              padding: '40px 80px',
              backgroundColor: buzzDisabled ? '#ccc' : '#ff4444',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: buzzDisabled ? 'not-allowed' : 'pointer'
            }}
          >
            {buzzDisabled ? '🔒 BLOQUÉ' : '🔔 BUZZ'}
          </button>
        </div>

        <div style={{ marginTop: '40px' }}>
          <h3>Classement</h3>
          <table border={1} cellPadding={10} style={{ margin: '0 auto' }}>
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {game?.players.sort((a, b) => b.score - a.score).map(p => (
                <tr key={p.id} style={{ fontWeight: p.id === playerData?.playerId ? 'bold' : 'normal' }}>
                  <td>{p.name}</td>
                  <td>{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return null
}
