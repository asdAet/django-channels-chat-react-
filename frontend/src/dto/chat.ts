import type { Message } from '../entities/message/types'
import type { RoomDetails } from '../entities/room/types'

export type RoomDetailsDto = RoomDetails
export type RoomMessagesDto = { messages: Message[] }
export type RoomMessagesParams = { limit?: number; beforeId?: number }

