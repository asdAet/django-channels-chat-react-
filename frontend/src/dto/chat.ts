import type { Message } from '../entities/message/types'
import type { DirectChatListItem, RoomDetails, RoomKind, RoomPeer } from '../entities/room/types'

export type RoomDetailsDto = RoomDetails

export type RoomMessagesPaginationDto = {
  limit: number
  hasMore: boolean
  nextBefore: number | null
}

export type RoomMessagesDto = {
  messages: Message[]
  pagination?: RoomMessagesPaginationDto
}

export type RoomMessagesParams = { limit?: number; beforeId?: number }

export type DirectStartResponseDto = {
  slug: string
  kind: RoomKind
  peer: RoomPeer
}

export type DirectChatsResponseDto = {
  items: DirectChatListItem[]
}

export type DirectChatListItemDto = DirectChatListItem
