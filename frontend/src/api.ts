const API_URL = 'http://localhost:3000'

export interface Game {
  id: string
  code: string
  status: 'LOBBY' | 'RUNNING' | 'PAUSED' | 'FINISHED'
  currentQuestionIndex: number
  questions: Question[]
  players: Player[]
}

export interface Question {
  id: string
  index: number
  text: string
  answer?: string
  points: number
  timeLimit?: number
}

export interface Player {
  id: string
  name: string
  score: number
  isConnected: boolean
}

export interface CreateGameResponse {
  gameId: string
  code: string
  mcToken: string
  questions: Question[]
}

export interface JoinGameResponse {
  playerId: string
  playerToken: string
  name: string
  gameCode: string
}

// Créer une partie
export async function createGame(data: { questions: { text: string; answer?: string; points?: number }[]; allowNegativePoints?: boolean }): Promise<CreateGameResponse> {
  const res = await fetch(`${API_URL}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create game')
  return res.json()
}

// Récupérer une partie
export async function getGame(code: string): Promise<Game> {
  const res = await fetch(`${API_URL}/games/${code}`)
  if (!res.ok) throw new Error('Game not found')
  return res.json()
}

// Rejoindre une partie
export async function joinGame(code: string, name: string): Promise<JoinGameResponse> {
  const res = await fetch(`${API_URL}/games/${code}/players/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message || 'Failed to join game')
  }
  return res.json()
}

// Démarrer une partie (MC)
export async function startGame(code: string, mcToken: string): Promise<void> {
  const res = await fetch(`${API_URL}/games/${code}/start?mcToken=${mcToken}`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to start game')
}

// Mettre à jour les questions (MC)
export async function updateQuestions(code: string, mcToken: string, questions: { text: string; answer?: string; points?: number }[]): Promise<void> {
  const res = await fetch(`${API_URL}/games/${code}/questions?mcToken=${mcToken}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions }),
  })
  if (!res.ok) throw new Error('Failed to update questions')
}

// Scoreboard
export async function getScoreboard(code: string): Promise<Player[]> {
  const res = await fetch(`${API_URL}/games/${code}/scoreboard`)
  if (!res.ok) throw new Error('Failed to fetch scoreboard')
  return res.json()
}
