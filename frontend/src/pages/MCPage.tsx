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

  // Surveiller les changements de statut du jeu
  useEffect(() => {
    if (!game) return
    
    console.log('MC - Game status changed to:', game.status, 'Current step:', step)
    
    if (game.status === 'RUNNING' && step === 'lobby') {
      console.log('MC - Switching to running mode')
      setStep('running')
    }
  }, [game?.status])

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
    if (!code || !mcToken || !socket) return
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
      
      // Notifier tous les clients via WebSocket en émettant un événement custom
      // Le backend recevra cet événement et renverra game:state à tous
      socket.emit('mc:game_finished', {}, (response: any) => {
        console.log('mc:game_finished response:', response)
      })
    } catch (err: any) {
      alert(`Erreur: ${err.message}`)
    }
  }

  // === STEP 1: Créer partie ===
  if (step === 'create') {
    return (
      <div style={{
        minHeight: '100vh',
        padding: '40px 20px',
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: '40px',
          textShadow: '3px 3px 0px #000',
        }}>
          CRÉER UNE PARTIE
        </h1>

        {error && <p style={{ color: '#ff6b6b', fontSize: '24px', marginBottom: '20px' }}>{error}</p>}

        <div style={{ marginTop: '30px' }}>
          {questions.map((q, i) => (
            <div key={i} style={{
              marginBottom: '30px',
              backgroundColor: '#413677',
              borderRadius: '15px',
              padding: '25px',
              border: '4px solid #000',
            }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  fontSize: '24px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '10px',
                }}>
                  QUESTION {i + 1}:
                </label>
                <input
                  type="text"
                  value={q.text}
                  onChange={e => {
                    const newQ = [...questions]
                    newQ[i].text = e.target.value
                    setQuestions(newQ)
                  }}
                  style={{
                    width: '100%',
                    padding: '15px',
                    fontSize: '24px',
                    backgroundColor: 'white',
                    color: '#000',
                    borderRadius: '10px',
                    textTransform: 'uppercase',
                  }}
                  placeholder="EX: QUELLE EST LA CAPITAL"
                />
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  fontSize: '24px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '10px',
                }}>
                  RÉPONSE (OPTIONEL):
                </label>
                <input
                  type="text"
                  value={q.answer}
                  onChange={e => {
                    const newQ = [...questions]
                    newQ[i].answer = e.target.value
                    setQuestions(newQ)
                  }}
                  style={{
                    width: '100%',
                    padding: '15px',
                    fontSize: '24px',
                    backgroundColor: 'white',
                    color: '#000',
                    borderRadius: '10px',
                    textTransform: 'uppercase',
                  }}
                  placeholder="EX: PARIS"
                />
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  fontSize: '24px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '10px',
                }}>
                  POINTS:
                </label>
                <input
                  type="number"
                  value={q.points}
                  onChange={e => {
                    const newQ = [...questions]
                    newQ[i].points = parseInt(e.target.value) || 1
                    setQuestions(newQ)
                  }}
                  style={{
                    width: '150px',
                    padding: '15px',
                    fontSize: '32px',
                    textAlign: 'center',
                    backgroundColor: 'white',
                    color: '#000',
                    borderRadius: '10px',
                    fontWeight: '600',
                  }}
                />
              </div>
              
              {questions.length > 1 && (
                <button
                  onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                  style={{
                    padding: '12px 25px',
                    fontSize: '22px',
                    backgroundColor: '#C22F2F',
                    color: 'white',
                    borderRadius: '10px',
                  }}
                >
                  ❌ SUPPRIMER
                </button>
              )}
            </div>
          ))}

          <button
            onClick={() => setQuestions([...questions, { text: '', answer: '', points: 1 }])}
            style={{
              width: '80px',
              height: '80px',
              fontSize: '42px',
              backgroundColor: '#3B713A',
              color: 'white',
              borderRadius: '50%',
              border: '4px solid #000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '20px auto',
            }}
          >
            +
          </button>
        </div>

        <button
          onClick={handleCreateGame}
          style={{
            width: '100%',
            maxWidth: '500px',
            padding: '20px 40px',
            fontSize: '36px',
            fontWeight: '600',
            backgroundColor: '#413677',
            color: 'white',
            borderRadius: '15px',
            textTransform: 'uppercase',
            marginTop: '30px',
            display: 'block',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          CRÉER UNE PARTIE
        </button>
      </div>
    )
  }

  // === STEP 2: Lobby (attente joueurs) ===
  if (step === 'lobby') {
    return (
      <div style={{
        minHeight: '100vh',
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
          LOBBY - CODE: {code}
        </h1>

        {error && <p style={{ color: '#ff6b6b', fontSize: '24px', marginBottom: '20px' }}>{error}</p>}

        <p style={{ fontSize: '20px', marginBottom: '15px' }}>
          LIEN JOUEUR: HTTP://LOCALHOST:5173/PLAYER/{code}
        </p>

        <div style={{
          backgroundColor: '#413677',
          borderRadius: '15px',
          padding: '30px',
          marginBottom: '40px',
          border: '4px solid #000',
          maxWidth: '600px',
          margin: '40px auto',
        }}>
          <h3 style={{
            fontSize: '36px',
            marginBottom: '20px',
            textTransform: 'uppercase',
          }}>
            QUESTIONS ({game?.questions.length || 0})
          </h3>
          
          {game?.questions.map((q, index) => (
            <div key={q.id} style={{
              padding: '15px',
              marginBottom: '10px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '10px',
              textAlign: 'left',
            }}>
              <div style={{ fontSize: '24px', fontWeight: '600' }}>
                {index + 1}. {q.text} ({q.points}PTS)
              </div>
              {q.answer && (
                <div style={{ fontSize: '20px', marginTop: '5px', opacity: 0.8 }}>
                  RÉPONSE: {q.answer}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleStartGame}
          disabled={!game || game.players.length === 0}
          style={{
            width: '100%',
            maxWidth: '500px',
            padding: '25px 40px',
            fontSize: '36px',
            fontWeight: '600',
            backgroundColor: game && game.players.length > 0 ? '#3B713A' : '#555',
            color: 'white',
            borderRadius: '15px',
            textTransform: 'uppercase',
            marginTop: '20px',
          }}
        >
          DÉMARRER
        </button>
      </div>
    )
  }

  // === STEP 3: Partie en cours ===
  if (step === 'running') {
    // Utiliser game en priorité car il a les données complètes, puis socket.gameState pour les mises à jour temps réel
    const currentGameState = game || socket?.gameState
    const currentQuestion = currentGameState?.currentQuestion || currentGameState?.questions?.[currentGameState?.currentQuestionIndex]
    const currentState = socket?.gameState?.currentQuestionState || currentGameState?.currentQuestionState

    console.log('MCPage render - status:', currentGameState?.status, 'step:', step)

    // Si le jeu est terminé, afficher l'écran de fin
    if (currentGameState?.status === 'FINISHED') {
      const sortedPlayers = [...(currentGameState?.players || [])].sort((a, b) => b.score - a.score)
      
      console.log('Showing finish screen, players:', sortedPlayers)
      
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
          
          {notification && (
            <div style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              backgroundColor: '#3B713A',
              color: 'white',
              padding: '20px 30px',
              borderRadius: '15px',
              fontSize: '24px',
              border: '3px solid #000',
              zIndex: 1000,
            }}>
              {notification}
            </div>
          )}

          <div style={{ 
            margin: '40px auto', 
            maxWidth: '600px',
            backgroundColor: '#413677',
            padding: '40px',
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
            
            {sortedPlayers.map((player, index) => (
              <div 
                key={player.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '20px',
                  margin: '15px 0',
                  backgroundColor: index === 0 ? '#3B713A' : 'rgba(255,255,255,0.1)',
                  borderRadius: '10px',
                  fontSize: '28px',
                  fontWeight: '600',
                }}
              >
                <span>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`} {player.name}
                </span>
                <span style={{ fontSize: '32px' }}>{player.score}</span>
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
              marginLeft: 'auto',
              marginRight: 'auto',
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
        padding: '40px 20px',
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: '20px',
          textShadow: '3px 3px 0px #000',
          textAlign: 'center',
        }}>
          CODE: {code}
        </h1>

        {notification && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#3B713A',
            color: 'white',
            padding: '20px 30px',
            borderRadius: '15px',
            fontSize: '24px',
            border: '3px solid #000',
            zIndex: 1000,
          }}>
            {notification}
          </div>
        )}

        <h3 style={{
          fontSize: '32px',
          textAlign: 'center',
          marginBottom: '30px',
        }}>
          QUESTION {(currentGameState?.currentQuestionIndex || 0) + 1} SUR {currentGameState?.questions?.length || 0}
        </h3>

        {currentQuestion && (
          <div style={{
            backgroundColor: '#413677',
            borderRadius: '15px',
            padding: '25px',
            marginBottom: '30px',
            border: '4px solid #000',
          }}>
            <h2 style={{ fontSize: '32px', marginBottom: '15px', textTransform: 'uppercase' }}>
              {currentQuestion.text}
            </h2>
            <div style={{
              display: 'flex',
              gap: '20px',
              flexWrap: 'wrap',
              fontSize: '24px',
            }}>
              <div>LA RÉPONSE</div>
              <div>{currentQuestion.points}PTS</div>
            </div>
            {currentQuestion.answer && (
              <p style={{ marginTop: '15px', fontSize: '28px' }}>
                {currentQuestion.answer}
              </p>
            )}
          </div>
        )}

        <div style={{
          backgroundColor: '#413677',
          borderRadius: '15px',
          padding: '25px',
          marginBottom: '30px',
          border: '4px solid #000',
        }}>
          <h3 style={{
            fontSize: '36px',
            marginBottom: '20px',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}>
            SCOREBOARD
          </h3>
          
          {currentGameState?.players?.sort((a, b) => b.score - a.score).map(p => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '15px',
                marginBottom: '10px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: '10px',
                fontSize: '28px',
                fontWeight: '600',
              }}
            >
              <span>{p.name}</span>
              <span>{p.score}</span>
            </div>
          ))}
        </div>

        {currentState?.status === 'LOCKED' && currentState.winnerPlayer && (
          <div style={{
            backgroundColor: '#413677',
            borderRadius: '15px',
            padding: '30px',
            marginBottom: '30px',
            border: '4px solid #000',
            textAlign: 'center',
          }}>
            <h3 style={{ fontSize: '42px', marginBottom: '25px', textTransform: 'uppercase' }}>
              {currentState.winnerPlayer.name} À BUZZÉ !
            </h3>
            
            <div style={{
              display: 'flex',
              gap: '15px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              <button
                onClick={() => handleJudgeBuzz(currentState.winnerPlayer.id, true)}
                style={{
                  padding: '20px 40px',
                  fontSize: '32px',
                  fontWeight: '600',
                  backgroundColor: '#3B713A',
                  color: 'white',
                  borderRadius: '15px',
                  flex: '1',
                  minWidth: '140px',
                }}
              >
                CORRECT
              </button>
              
              <button
                onClick={() => handleJudgeBuzz(currentState.winnerPlayer.id, false)}
                style={{
                  padding: '20px 40px',
                  fontSize: '32px',
                  fontWeight: '600',
                  backgroundColor: '#C22F2F',
                  color: 'white',
                  borderRadius: '15px',
                  flex: '1',
                  minWidth: '140px',
                }}
              >
                FAUX
              </button>
              
              <button
                onClick={handleNextQuestion}
                style={{
                  padding: '20px 40px',
                  fontSize: '32px',
                  fontWeight: '600',
                  backgroundColor: '#555',
                  color: 'white',
                  borderRadius: '15px',
                  flex: '1',
                  minWidth: '140px',
                }}
              >
                PASSER
              </button>
            </div>
          </div>
        )}

        {currentState?.status === 'IDLE' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
          }}>
            <button
              onClick={handleOpenBuzz}
              style={{
                width: '100%',
                padding: '25px 40px',
                fontSize: '36px',
                fontWeight: '600',
                backgroundColor: '#413677',
                color: 'white',
                borderRadius: '15px',
                textTransform: 'uppercase',
              }}
            >
              OUVRIR BUZZER
            </button>
            
            <button
              onClick={handleNextQuestion}
              style={{
                width: '100%',
                padding: '20px 40px',
                fontSize: '28px',
                fontWeight: '600',
                backgroundColor: '#555',
                color: 'white',
                borderRadius: '15px',
                textTransform: 'uppercase',
              }}
            >
              PASSER LA QUESTION
            </button>
          </div>
        )}

        {currentState?.status === 'OPEN' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '36px',
              marginBottom: '20px',
              textTransform: 'uppercase',
              fontWeight: '600',
            }}>
              🟢 BUZZER OUVERT
            </p>
            <button
              onClick={handleNextQuestion}
              style={{
                width: '100%',
                padding: '20px 40px',
                fontSize: '28px',
                fontWeight: '600',
                backgroundColor: '#555',
                color: 'white',
                borderRadius: '15px',
                textTransform: 'uppercase',
              }}
            >
              PASSER LA QUESTION
            </button>
          </div>
        )}

        {currentState?.status === 'RESOLVED' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
          }}>
            <p style={{
              fontSize: '32px',
              textAlign: 'center',
              marginBottom: '20px',
              textTransform: 'uppercase',
            }}>
              ✅ QUESTION RÉSOLUE
            </p>
            
            {(currentGameState?.currentQuestionIndex || 0) < ((currentGameState?.questions?.length || 1) - 1) ? (
              <button
                onClick={handleNextQuestion}
                style={{
                  width: '100%',
                  padding: '25px 40px',
                  fontSize: '36px',
                  fontWeight: '600',
                  backgroundColor: '#3B713A',
                  color: 'white',
                  borderRadius: '15px',
                  textTransform: 'uppercase',
                }}
              >
                PASSER LA QUESTION
              </button>
            ) : (
              <button
                onClick={handleFinishGame}
                style={{
                  width: '100%',
                  padding: '25px 40px',
                  fontSize: '36px',
                  fontWeight: '600',
                  backgroundColor: '#3B713A',
                  color: 'white',
                  borderRadius: '15px',
                  textTransform: 'uppercase',
                }}
              >
                🏁 TERMINER LE QUIZ
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}
