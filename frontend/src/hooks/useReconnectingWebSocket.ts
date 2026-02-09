import { useCallback, useEffect, useRef, useState } from 'react'

export type WebSocketStatus = 'idle' | 'connecting' | 'online' | 'offline' | 'error' | 'closed'

type WebSocketOptions = {
  url: string | null
  protocols?: string | string[]
  onMessage?: (event: MessageEvent) => void
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
  onError?: (event: Event) => void
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export const useReconnectingWebSocket = (options: WebSocketOptions) => {
  const {
    url,
    protocols,
    onMessage,
    onOpen,
    onClose,
    onError,
    maxRetries = 8,
    baseDelayMs = 600,
    maxDelayMs = 10_000,
  } = options

  const [status, setStatus] = useState<WebSocketStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<{ attempt: number; timeoutId: number | null }>({
    attempt: 0,
    timeoutId: null,
  })
  const handlersRef = useRef({ onMessage, onOpen, onClose, onError })
  const activeRef = useRef(true)

  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose, onError }
  }, [onMessage, onOpen, onClose, onError])

  const clearRetry = () => {
    if (retryRef.current.timeoutId) {
      window.clearTimeout(retryRef.current.timeoutId)
      retryRef.current.timeoutId = null
    }
  }

  const cleanup = useCallback(() => {
    clearRetry()
    if (socketRef.current) {
      socketRef.current.onopen = null
      socketRef.current.onclose = null
      socketRef.current.onerror = null
      socketRef.current.onmessage = null
      socketRef.current.close()
      socketRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!url) {
      cleanup()
      setStatus('idle')
      return
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      cleanup()
      setStatus('offline')
      return
    }

    cleanup()
    setStatus('connecting')

    const socket = new WebSocket(url, protocols)
    socketRef.current = socket

    socket.onopen = () => {
      retryRef.current.attempt = 0
      setStatus('online')
      setLastError(null)
      handlersRef.current.onOpen?.()
    }

    socket.onmessage = (event) => {
      handlersRef.current.onMessage?.(event)
    }

    socket.onerror = (event) => {
      setStatus('error')
      setLastError('connection_error')
      handlersRef.current.onError?.(event)
    }

    socket.onclose = (event) => {
      handlersRef.current.onClose?.(event)
      if (!activeRef.current) return

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setStatus('offline')
        return
      }

      setStatus('closed')

      if (retryRef.current.attempt >= maxRetries) {
        setStatus('error')
        setLastError('reconnect_limit')
        return
      }

      const attempt = retryRef.current.attempt
      retryRef.current.attempt += 1
      const jitter = Math.floor(Math.random() * 200)
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + jitter
      retryRef.current.timeoutId = window.setTimeout(() => {
        connect()
      }, delay)
    }
  }, [baseDelayMs, cleanup, maxDelayMs, maxRetries, protocols, url])

  useEffect(() => {
    activeRef.current = true
    connect()
    return () => {
      activeRef.current = false
      cleanup()
    }
  }, [connect, cleanup])

  useEffect(() => {
    const handleOnline = () => {
      setStatus('connecting')
      connect()
    }
    const handleOffline = () => {
      setStatus('offline')
      cleanup()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [cleanup, connect])

  const send = useCallback((data: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(data)
      return true
    }
    return false
  }, [])

  return {
    status,
    lastError,
    send,
    reconnect: connect,
  }
}
