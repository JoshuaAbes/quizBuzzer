import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createGame, getGame, startGame, updateQuestions, Game, CreateGameResponse } from '../api'
import { useSocket } from '../hooks/useSocket'

export default function MCPage() {
  const { code: urlCode } = useParams()
  const navigate = useNavigate()

  const [step, setStep] = useState<'create' | 'lobby' | 'running'>(urlCode ? 'lobby' : 'create')
  const [gameData, setGameData] = useState<CreateGameResponse | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [questions, setQuestions] = useState<{ text: string; answer: string; points: number }[]>([
    { text: '', answer: '', points: 1 },
  ])
  const [error, setError] = useState('')
  const [notification, setNotification] = useState('')

  const code = gameData?.code || urlCode || ''
  const mcToken = gameData?.mcToken || localStorage.getItem(`mcToken_${code}`) || ''
  
  // Fonction pour afficher une notification temporaire
  const showNotification = (message: string) => {
    setNotification(message)
    setTimeout(() => setNotification(''), 3000) // Disparaît après 3 secondes
  }

  // WebSocket - toujours appeler le hook, mais désactiver si pas de code/token
  const socketEnabled = Boolean(code && mcToken)
  const socket = useSocket(socketEnabled ? { code, token: mcToken, role: 'mc' } : { code: 'disabled', token: 'disabled', role: 'mc' })

  useEffect(() => {
    if (urlCode && !game) {
      const storedToken = localStorage.getItem(`mcToken_${urlCode}`)
      if (storedToken) {
        loadGame(urlCode)
      }
    }
  }, [urlCode, game])

  useEffect(() => {
    if (!socketEnabled || !socket) return

    socket.on('game:state', (data: any) => {
      console.log('MC received game state:', data)
      // Fusionner avec game existant pour garder les questions
      setGame(prevGame => ({
        ...data,
        questions: data.questions || prevGame?.questions || [],
      }))
    })

    socket.on('player:connected', (data: any) => {
      console.log('Player connected:', data)
    })

    socket.on('buzz:winner', (data: any) => {
      showNotification(`🔔 ${data.playerName} a buzzé !`)
    })

    socket.on('buzz:correct', (data: any) => {
      console.log('Buzz correct:', data)
      showNotification(`✅ Correct ! +${data.points} points`)
    })

    socket.on('buzz:wrong', (data: any) => {
      console.log('Buzz wrong:', data)
      showNotification(`❌ Mauvaise réponse !`)
    })

    socket.on('question:reopened', (data: any) => {
      console.log('Question reopened:', data)
    })
  }, [socket, socketEnabled])

  async function loadGame(code: string) {
    try {
      const g = await getGame(code)
      setGame(g)
      if (g.status === 'LOBBY') {
        setStep('lobby')
      } else if (g.status === 'RUNNING' || g.status === 'PAUSED') {
        setStep('running')
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleCreateGame() {
    try {
      setError('')
      const validQuestions = questions.filter(q => q.text.trim())
      
      if (validQuestions.length === 0) {
        setError('Ajoutez au moins une question')
        return
      }

      const data = await createGame({
        questions: validQuestions,
        allowNegativePoints: false,
      })

      setGameData(data)
      localStorage.setItem(`mcToken_${data.code}`, data.mcToken)
      navigate(`/mc/${data.code}`)
      setStep('lobby')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function handleStartGame() {
    try {
      await startGame(code, mcToken)
      // Recharger les données de la partie après démarrage
      const updatedGame = await getGame(code)
      setGame(updatedGame)
      setStep('running')
    } catch (err: any) {
      setError(err.message)
    }
  }

  function handleOpenBuzz() {
    if (!socketEnabled || !socket || !game) return
    
    // Essayer plusieurs sources pour currentQuestion
    let currentQuestion = socket.gameState?.currentQuestion
    
    if (!currentQuestion && game.questions && game.questions.length > 0) {
      currentQuestion = game.questions[game.currentQuestionIndex]
    }
    
    console.log('handleOpenBuzz:', {
      socketEnabled,
      hasSocket: !!socket,
      gameState: socket.gameState,
      game: game,
      currentQuestion,
    })
    
    if (!currentQuestion || !currentQuestion.id) {
      console.error('No current question available', {
        'socket.gameState': socket.gameState,
        'game.questions': game.questions,
        'currentQuestionIndex': game.currentQuestionIndex,
      })
      alert('Erreur: Aucune question disponible. Rechargez la page.')
      return
    }
    
    console.log('Emitting mc:open_buzz with questionId:', currentQuestion.id)
    socket.emit('mc:open_buzz', { questionId: currentQuestion.id }, (response: any) => {
      console.log('mc:open_buzz response:', response)
      if (!response.success) {
        alert(`Erreur: ${response.error}`)
      }
    })
  }

  function handleJudgeBuzz(playerId: string, isCorrect: boolean) {
    if (!socketEnabled || !socket || !game) return
    
    const currentQuestion = socket.gameState?.currentQuestion || game.questions?.[game.currentQuestionIndex]
    if (!currentQuestion || !currentQuestion.id) {
      console.error('No current question available')
      return
    }
    
    console.log('Emitting mc:judge_buzz:', {
      questionId: currentQuestion.id,
      playerId,
      isCorrect
    })
    
    socket.emit('mc:judge_buzz', { questionId: currentQuestion.id, playerId, isCorrect }, (response: any) => {
      console.log('mc:judge_buzz response:', response)
      if (response && !response.success) {
        alert(`Erreur: ${response.error}`)
      }
    })
  }

  function handleNextQuestion() {
    if (!socket) return
    console.log('Emitting mc:next_question')
    socket.emit('mc:next_question', {}, (response: any) => {
      console.log('mc:next_question response:', response)
      if (response && !response.success) {
        alert(`Erreur: ${response.error}`)
      }
    })
  }

  async function handleFinishGame() {
    if (!code || !mcToken) return
    try {
      const response = await fetch(`http://localhost:3000/games/${code}/finish?mcToken=${mcToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) throw new Error('Erreur lors de la fin du jeu')
      showNotification('🏁 Quiz terminé !')
      // Recharger le jeu pour voir le statut FINISHED
      const updatedGame = await getGame(code)
      setGame(updatedGame)
    } catch (err: any) {
      alert(`Erreur: ${err.message}`)
    }
  }

  // === STEP 1: Créer partie ===
  if (step === 'create') {
    return (
      <div style={{ padding: '20px' }}>
        <h1>🎙️ Créer une partie</h1>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <div style={{ marginTop: '20px' }}>
          <h3>Questions</h3>
          {questions.map((q, i) => (
            <div key={i} style={{ marginBottom: '15px', border: '1px solid #ccc', padding: '10px' }}>
              <div>
                <label>Question {i + 1}:</label><br />
                <input
                  type="text"
                  value={q.text}
                  onChange={e => {
                    const newQ = [...questions]
                    newQ[i].text = e.target.value
                    setQuestions(newQ)
                  }}
                  style={{ width: '100%', padding: '5px' }}
                  placeholder="Ex: Quelle est la capitale de la France ?"
                />
              </div>
              <div style={{ marginTop: '10px' }}>
                <label>Réponse (optionnel):</label><br />
                <input
                  type="text"
                  value={q.answer}
                  onChange={e => {
                    const newQ = [...questions]
                    newQ[i].answer = e.target.value
                    setQuestions(newQ)
                  }}
                  style={{ width: '100%', padding: '5px' }}
                  placeholder="Ex: Paris"
                />
              </div>
              <div style={{ marginTop: '10px' }}>
                <label>Points:</label><br />
                <input
                  type="number"
                  value={q.points}
                  onChange={e => {
                    const newQ = [...questions]
                    newQ[i].points = parseInt(e.target.value) || 1
                    setQuestions(newQ)
                  }}
                  style={{ width: '80px', padding: '5px' }}
                />
              </div>
              {questions.length > 1 && (
                <button
                  onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                  style={{ marginTop: '10px' }}
                >
                  ❌ Supprimer
                </button>
              )}
            </div>
          ))}

          <button onClick={() => setQuestions([...questions, { text: '', answer: '', points: 1 }])}>
            ➕ Ajouter une question
          </button>
        </div>

        <button
          onClick={handleCreateGame}
          style={{ marginTop: '20px', fontSize: '18px', padding: '10px 20px' }}
        >
          ✅ Créer la partie
        </button>
      </div>
    )
  }

  // === STEP 2: Lobby (attente joueurs) ===
  if (step === 'lobby') {
    return (
      <div style={{ padding: '20px' }}>
        <h1>🎙️ Lobby - Code: <strong>{code}</strong></h1>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <p>Partagez ce code aux joueurs pour qu'ils rejoignent !</p>
        <p>Lien joueur: <code>http://localhost:5173/player/{code}</code></p>

        <h3>Joueurs connectés ({game?.players.length || 0})</h3>
        <ul>
          {game?.players.map(p => (
            <li key={p.id}>
              {p.name} {p.isConnected ? '🟢' : '🔴'}
            </li>
          ))}
        </ul>

        <h3>Questions ({game?.questions.length || 0})</h3>
        <ol>
          {game?.questions.map(q => (
            <li key={q.id}>{q.text} ({q.points} pts)</li>
          ))}
        </ol>

        <button
          onClick={handleStartGame}
          disabled={!game || game.players.length === 0}
          style={{ fontSize: '18px', padding: '10px 20px', marginTop: '20px' }}
        >
          🚀 Démarrer la partie
        </button>
      </div>
    )
  }

  // === STEP 3: Partie en cours ===
  if (step === 'running') {
    // Utiliser socket.gameState pour les données en temps réel
    const currentGameState = socket?.gameState || game
    const currentQuestion = currentGameState?.currentQuestion || currentGameState?.questions?.[currentGameState?.currentQuestionIndex]
    const currentState = currentGameState?.currentQuestionState

    return (
      <div style={{ padding: '20px' }}>
        <h1>🎙️ Partie en cours - Code: {code}</h1>

        {/* Notification temporaire */}
        {notification && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '15px 20px',
            borderRadius: '8px',
            fontSize: '18px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            zIndex: 1000,
            animation: 'fadeIn 0.3s'
          }}>
            {notification}
          </div>
        )}

        <h3>
          Question {(currentGameState?.currentQuestionIndex || 0) + 1} / {currentGameState?.questions?.length || 0}
        </h3>

        {currentQuestion && (
          <div style={{ border: '2px solid #333', padding: '15px', marginTop: '10px' }}>
            <h2>{currentQuestion.text}</h2>
            {currentQuestion.answer && (
              <p><strong>Réponse:</strong> {currentQuestion.answer}</p>
            )}
            <p><strong>Points:</strong> {currentQuestion.points}</p>
          </div>
        )}

        <div style={{ marginTop: '20px' }}>
          <h4>État: {currentState?.status || 'IDLE'}</h4>

          {currentState?.status === 'IDLE' && (
            <div>
              <button onClick={handleOpenBuzz} style={{ fontSize: '18px', padding: '10px 20px', marginRight: '10px' }}>
                🔓 Ouvrir le buzz
              </button>
              <button onClick={handleNextQuestion} style={{ fontSize: '18px', padding: '10px 20px', backgroundColor: '#666', color: 'white' }}>
                ⏭️ Passer la question
              </button>
            </div>
          )}

          {currentState?.status === 'OPEN' && (
            <div>
              <p style={{ color: 'green', fontSize: '20px' }}>🟢 Buzz ouvert ! En attente...</p>
              <button onClick={handleNextQuestion} style={{ fontSize: '16px', padding: '8px 16px', backgroundColor: '#666', color: 'white', marginTop: '10px' }}>
                ⏭️ Passer la question
              </button>
            </div>
          )}

          {currentState?.status === 'LOCKED' && currentState.winnerPlayer && (
            <div style={{ border: '2px solid orange', padding: '10px', marginTop: '10px' }}>
              <h3>🔔 {currentState.winnerPlayer.name} a buzzé !</h3>
              <button
                onClick={() => handleJudgeBuzz(currentState.winnerPlayer.id, true)}
                style={{ marginRight: '10px', padding: '10px', fontSize: '16px', backgroundColor: 'green', color: 'white' }}
              >
                ✅ Correct
              </button>
              <button
                onClick={() => handleJudgeBuzz(currentState.winnerPlayer.id, false)}
                style={{ padding: '10px', fontSize: '16px', backgroundColor: 'red', color: 'white' }}
              >
                ❌ Faux
              </button>
              <button 
                onClick={handleNextQuestion} 
                style={{ marginLeft: '10px', padding: '10px', fontSize: '16px', backgroundColor: '#666', color: 'white' }}
              >
                ⏭️ Passer
              </button>
            </div>
          )}

          {currentState?.status === 'RESOLVED' && (
            <div>
              <p style={{ color: 'blue', fontSize: '18px' }}>✅ Question résolue</p>
              {(currentGameState?.currentQuestionIndex || 0) < ((currentGameState?.questions?.length || 1) - 1) ? (
                <button onClick={handleNextQuestion} style={{ fontSize: '18px', padding: '10px 20px' }}>
                  ➡️ Question suivante
                </button>
              ) : (
                <button onClick={handleFinishGame} style={{ fontSize: '18px', padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white' }}>
                  🏁 Terminer le quiz
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: '30px' }}>
          <h3>Scoreboard</h3>
          <table border={1} cellPadding={10}>
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {currentGameState?.players?.sort((a, b) => b.score - a.score).map(p => (
                <tr key={p.id}>
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
