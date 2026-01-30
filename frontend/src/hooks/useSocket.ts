import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : 'http://192.168.115.112:3000'

interface UseSocketOptions {
  code: string
  token: string
  role: 'mc' | 'player' | 'screen'
}

export function useSocket({ code, token, role }: UseSocketOptions) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [gameState, setGameState] = useState<any>(null)
  const listenersRef = useRef<Map<string, Function[]>>(new Map())

  // Ne pas connecter si code est 'disabled'
  const shouldConnect = code !== 'disabled' && token !== 'disabled'

  useEffect(() => {
    if (!shouldConnect) {
      return
    }

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
    })

    newSocket.on('connect', () => {
      console.log('✅ Socket connected')
      setConnected(true)

      // Authentification
      newSocket.emit('auth:connect', { code, token, role }, (response: any) => {
        if (response.success) {
          console.log('✅ Authenticated as', role)
        } else {
          console.error('❌ Auth failed:', response.error)
        }
      })
    })

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected')
      setConnected(false)
    })

    // Game state
    newSocket.on('game:state', (data: any) => {
      console.log('📊 Game state received:', { 
        status: data.status, 
        currentQuestionIndex: data.currentQuestionIndex,
        currentQuestionState: data.currentQuestionState?.status,
        playersCount: data.players?.length 
      })
      setGameState(data)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [code, token, role, shouldConnect])

  // Écouter un événement
  const on = useCallback((event: string, handler: Function) => {
    if (!socket) return

    socket.on(event, (...args: any[]) => handler(...args))

    // Sauvegarder pour cleanup
    const handlers = listenersRef.current.get(event) || []
    handlers.push(handler)
    listenersRef.current.set(event, handlers)
  }, [socket])

  // Émettre un événement
  const emit = useCallback((event: string, data?: any, callback?: Function) => {
    if (!socket) return
    socket.emit(event, data, callback)
  }, [socket])

  return {
    socket,
    connected,
    gameState,
    on,
    emit,
  }
}
