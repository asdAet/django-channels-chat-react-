import type { SessionResponse } from '../shared/api/types'
import type { UserProfile } from '../entities/user/types'

export type LoginDto = {
  username: string
  password: string
}

export type RegisterDto = {
  username: string
  password1: string
  password2: string
}

export type UpdateProfileDto = {
  username: string
  email: string
  image?: File | null
  bio?: string
}

export type SessionDto = SessionResponse
export type UserProfileDto = UserProfile

