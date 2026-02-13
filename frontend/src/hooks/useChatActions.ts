import { useCallback } from 'react'

import { chatController } from '../controllers/ChatController'
import type { RoomMessagesParams } from '../dto/chat'

export const useChatActions = () => {
  const getRoomDetails = useCallback((slug: string) => chatController.getRoomDetails(slug), [])
  const getRoomMessages = useCallback(
    (slug: string, params?: RoomMessagesParams) => chatController.getRoomMessages(slug, params),
    [],
  )
  const startDirectChat = useCallback((username: string) => chatController.startDirectChat(username), [])
  const getDirectChats = useCallback(() => chatController.getDirectChats(), [])

  return {
    getRoomDetails,
    getRoomMessages,
    startDirectChat,
    getDirectChats,
  }
}
