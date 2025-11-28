import type { Message } from '../../entities/message/types'
import type { RoomDetails } from '../../entities/room/types'
import type { UserProfile } from '../../entities/user/types'

export type SessionResponse = {
  authenticated: boolean
  user: UserProfile | null
}

export type ApiError = {
  status: number
  message: string
  data?: Record<string, unknown>
}

export type { Message, RoomDetails, UserProfile }
