import { createContext } from 'react'

import type { DirectChatListItemDto } from '../../dto/chat'
import type { WebSocketStatus } from '../../hooks/useReconnectingWebSocket'

export type DirectInboxContextValue = {
  items: DirectChatListItemDto[]
  loading: boolean
  error: string | null
  status: WebSocketStatus
  unreadSlugs: string[]
  unreadCounts: Record<string, number>
  unreadDialogsCount: number
  setActiveRoom: (roomSlug: string | null) => void
  markRead: (roomSlug: string) => void
  refresh: () => Promise<void>
}

const noop = () => {}
const noopAsync = async () => {}

export const FALLBACK_DIRECT_INBOX: DirectInboxContextValue = {
  items: [],
  loading: false,
  error: null,
  status: 'idle',
  unreadSlugs: [],
  unreadCounts: {},
  unreadDialogsCount: 0,
  setActiveRoom: noop,
  markRead: noop,
  refresh: noopAsync,
}

export const DirectInboxContext = createContext<DirectInboxContextValue>(FALLBACK_DIRECT_INBOX)
