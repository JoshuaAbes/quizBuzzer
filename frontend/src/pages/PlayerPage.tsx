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
        setMessage(`Vous avez buzzé en premier ! Répondez maintenant.`)
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
        setMessage(`Bonne réponse ! +${data.points} pts`)
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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 20px',
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: '40px',
          textShadow: '3px 3px 0px #000',
        }}>
          REJOINDRE UNE PARTIE
        </h1>

        {error && <p style={{ color: '#ff6b6b', fontSize: '24px', marginBottom: '20px' }}>{error}</p>}

        <div style={{ marginBottom: '30px' }}>
          <label style={{ 
            fontSize: '28px',
            fontWeight: '600',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: '15px',
          }}>
            CODE DE LA PARTIE:
          </label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="EX: AB12CD"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '20px',
              fontSize: '32px',
              textAlign: 'center',
              backgroundColor: 'white',
              color: '#000',
              borderRadius: '15px',
              fontWeight: '600',
              textTransform: 'uppercase',
            }}
          />
        </div>

        <div style={{ marginBottom: '40px' }}>
          <label style={{ 
            fontSize: '28px',
            fontWeight: '600',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: '15px',
          }}>
            VOTRE NOM:
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="EX: ALICE"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '20px',
              fontSize: '32px',
              textAlign: 'center',
              backgroundColor: 'white',
              color: '#000',
              borderRadius: '15px',
              fontWeight: '600',
              textTransform: 'uppercase',
            }}
          />
        </div>

        <button
          onClick={handleJoin}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '20px 40px',
            fontSize: '36px',
            fontWeight: '600',
            backgroundColor: '#413677',
            color: 'white',
            borderRadius: '15px',
            textTransform: 'uppercase',
            marginTop: '20px',
          }}
        >
          REJOINDRE
        </button>
      </div>
    )
  }

  // === STEP 2: Waiting ===
  if (step === 'waiting') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 20px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: '20px',
          textShadow: '3px 3px 0px #000',
        }}>
          EN ATTENTE...
        </h1>
        
        <p style={{ fontSize: '32px', marginBottom: '10px' }}>
          BIENVENUE {playerData?.name} !
        </p>
        
        <p style={{ fontSize: '28px', marginBottom: '40px' }}>
          CODE : {code}
        </p>

        <h3 style={{ 
          fontSize: '36px',
          marginBottom: '20px',
          textTransform: 'uppercase',
        }}>
          JOUEURS CONNECTÉS ({game?.players?.length || 0})
        </h3>
        
        <div style={{
          backgroundColor: '#413677',
          borderRadius: '15px',
          padding: '20px',
          marginBottom: '40px',
          maxWidth: '500px',
          margin: '0 auto 40px',
          border: '4px solid #000',
        }}>
          {game?.players.map(p => (
            <div key={p.id} style={{
              fontSize: '28px',
              padding: '15px',
              marginBottom: '10px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span>{p.name}</span>
              <span>{p.isConnected ? '🟢' : '🔴'}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '32px', marginTop: '30px' }}>
          ⏳ EN ATTENTE QUE LE MC DÉMARRE...
        </p>
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
        <div style={{ 
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '40px 20px',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontSize: '54px',
            fontWeight: '700',
            textTransform: 'uppercase',
            marginBottom: '40px',
            textShadow: '3px 3px 0px #000',
          }}>
            🏁 QUIZ TERMINÉ !
          </h1>
          
          <div style={{ 
            margin: '20px auto', 
            padding: '30px',
            backgroundColor: '#413677',
            borderRadius: '20px',
            maxWidth: '400px',
            border: '4px solid #000',
          }}>
            <h2 style={{ fontSize: '48px', marginBottom: '20px' }}>
              {playerRank === 1 ? '🥇' : playerRank === 2 ? '🥈' : playerRank === 3 ? '🥉' : ''}
              {' '}{playerData?.name}
            </h2>
            <p style={{ fontSize: '64px', fontWeight: 'bold', margin: '20px 0' }}>
              {player?.score || 0} PTS
            </p>
            <p style={{ fontSize: '32px' }}>
              {playerRank === 1 ? 'CHAMPION !' : `${playerRank}ÈME PLACE`}
            </p>
          </div>

          <div style={{ 
            margin: '40px auto', 
            maxWidth: '600px',
            backgroundColor: '#413677',
            padding: '30px',
            borderRadius: '20px',
            border: '4px solid #000',
          }}>
            <h2 style={{ 
              marginBottom: '30px',
              fontSize: '42px',
              textTransform: 'uppercase',
            }}>
              🏆 SCOREBOARD
            </h2>
            
            {sortedPlayers.map((p, index) => (
              <div 
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '20px',
                  margin: '15px 0',
                  backgroundColor: p.id === playerData?.playerId ? '#3B713A' : 'rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  fontSize: '28px',
                  fontWeight: '600',
                  border: p.id === playerData?.playerId ? '3px solid #fff' : 'none',
                }}
              >
                <span>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`} {p.name}
                </span>
                <span style={{ fontSize: '32px' }}>{p.score}</span>
              </div>
            ))}
          </div>

          <button 
            onClick={() => navigate('/')}
            style={{ 
              fontSize: '32px', 
              padding: '20px 40px', 
              backgroundColor: '#413677',
              color: 'white',
              borderRadius: '15px',
              marginTop: '20px',
              maxWidth: '400px',
              width: '100%',
            }}
          >
            🏠 RETOUR À L'ACCUEIL
          </button>
        </div>
      )
    }

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 20px',
      }}>
        <h1 style={{
          fontSize: '54px',
          fontWeight: '700',
          textTransform: 'uppercase',
          textAlign: 'center',
          marginBottom: '10px',
          textShadow: '3px 3px 0px #000',
        }}>
          {playerData?.name}
        </h1>
        
        <h2 style={{
          fontSize: '36px',
          textAlign: 'center',
          marginBottom: '30px',
        }}>
          SCORE : {player?.score || 0}
        </h2>

        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '28px', marginBottom: '20px' }}>
            QUESTION {(game?.currentQuestionIndex || 0) + 1}/{game?.questions?.length || 0}
          </h3>
          
          {currentQuestion && (
            <div style={{
              fontSize: '28px',
              padding: '30px',
              backgroundColor: '#413677',
              borderRadius: '15px',
              border: '4px solid #000',
              marginBottom: '30px',
              textTransform: 'uppercase',
            }}>
              {currentQuestion.text}
            </div>
          )}

          {message && (
            <div style={{
              padding: '20px',
              marginBottom: '20px',
              backgroundColor: message.includes('✅') ? '#3B713A' : message.includes('❌') ? '#C22F2F' : '#413677',
              fontSize: '28px',
              borderRadius: '15px',
              border: '4px solid #000',
              textTransform: 'uppercase',
            }}>
              {message}
            </div>
          )}
        </div>

        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '40px',
        }}>
          <p style={{
            fontSize: '32px',
            marginBottom: '20px',
            textTransform: 'uppercase',
            fontWeight: '600',
          }}>
            {buzzDisabled ? '🔒 BUZZER FERMÉ' : '🟢 BUZZER OUVERT'}
          </p>
          
          <button
            onClick={handleBuzz}
            disabled={buzzDisabled}
            style={{
              width: '280px',
              height: '280px',
              fontSize: '54px',
              fontWeight: '700',
              backgroundColor: buzzDisabled ? '#555' : '#C22F2F',
              color: 'white',
              borderRadius: '50%',
              border: '6px solid #000',
              cursor: buzzDisabled ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
            }}
          >
            BUZZER
          </button>
        </div>

        <div style={{
          backgroundColor: '#413677',
          borderRadius: '15px',
          padding: '20px',
          border: '4px solid #000',
        }}>
          <h3 style={{
            fontSize: '36px',
            marginBottom: '20px',
            textAlign: 'center',
            textTransform: 'uppercase',
          }}>
            SCOREBOARD
          </h3>
          
          {game?.players.sort((a, b) => b.score - a.score).map(p => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '15px',
                marginBottom: '10px',
                backgroundColor: p.id === playerData?.playerId ? '#3B713A' : 'rgba(255,255,255,0.1)',
                borderRadius: '10px',
                fontSize: '28px',
                fontWeight: '600',
                border: p.id === playerData?.playerId ? '3px solid #fff' : 'none',
              }}
            >
              <span>{p.name}</span>
              <span>{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}
