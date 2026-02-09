import { useCallback, useEffect, useRef, useState } from 'react'

import { chatController } from '../controllers/ChatController'
import type { RoomDetailsDto } from '../dto/chat'
import type { Message } from '../entities/message/types'
import type { UserProfileDto } from '../dto/auth'
import { debugLog } from '../shared/lib/debug'
import { sanitizeText } from '../shared/lib/sanitize'

const PAGE_SIZE = 50
const MAX_MESSAGE_LENGTH = 1000

const sanitizeMessage = (message: Message): Message => ({
  ...message,
  content: sanitizeText(message.content, MAX_MESSAGE_LENGTH),
})

export type ChatRoomState = {
  details: RoomDetailsDto | null
  messages: Message[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  error: string | null
}

export const useChatRoom = (slug: string, user: UserProfileDto | null) => {
  const [state, setState] = useState<ChatRoomState>({
    details: null,
    messages: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    error: null,
  })
  const requestIdRef = useRef(0)

  const loadInitial = useCallback(() => {
    if (!user) return
    const requestId = ++requestIdRef.current
    setState((prev) => ({ ...prev, loading: true, error: null }))

    Promise.all([
      chatController.getRoomDetails(slug),
      chatController.getRoomMessages(slug, { limit: PAGE_SIZE }),
    ])
      .then(([info, payload]) => {
        if (requestId !== requestIdRef.current) return
        const sanitized = payload.messages.map(sanitizeMessage)
        setState({
          details: info,
          messages: sanitized,
          loading: false,
          loadingMore: false,
          hasMore: sanitized.length >= PAGE_SIZE,
          error: null,
        })
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return
        debugLog('Room load failed', err)
        setState((prev) => ({ ...prev, loading: false, error: 'load_failed' }))
      })
  }, [slug, user])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    if (!user) return
    if (state.loadingMore || !state.hasMore) return

    const oldestId = state.messages[0]?.id
    if (!oldestId) {
      setState((prev) => ({ ...prev, hasMore: false }))
      return
    }

    const requestId = ++requestIdRef.current
    setState((prev) => ({ ...prev, loadingMore: true }))
    try {
      const payload = await chatController.getRoomMessages(slug, {
        limit: PAGE_SIZE,
        beforeId: oldestId,
      })
      if (requestId !== requestIdRef.current) return
      const sanitized = payload.messages.map(sanitizeMessage)
      setState((prev) => ({
        ...prev,
        messages: [...sanitized, ...prev.messages],
        loadingMore: false,
        hasMore: sanitized.length >= PAGE_SIZE,
      }))
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      debugLog('Room load more failed', err)
      setState((prev) => ({ ...prev, loadingMore: false }))
    }
  }, [slug, user, state.hasMore, state.loadingMore, state.messages])

  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setState((prev) => {
      const nextMessages = typeof updater === 'function' ? updater(prev.messages) : updater
      return { ...prev, messages: nextMessages.map(sanitizeMessage) }
    })
  }, [])

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }))
  }, [])

  return {
    details: state.details,
    messages: state.messages,
    loading: state.loading,
    loadingMore: state.loadingMore,
    hasMore: state.hasMore,
    error: state.error,
    loadMore,
    setMessages,
    setError,
  }
}
