import type { Message } from '../../entities/message/types'
import type { DirectChatListItem, RoomDetails } from '../../entities/room/types'
import type { UserProfile } from '../../entities/user/types'
import type { SessionResponse } from '../../shared/api/types'

export type UpdateProfileInput = {
  username: string
  email: string
  image?: File | null
  bio?: string
}

export type RoomMessagesResponse = {
  messages: Message[]
  pagination?: {
    limit: number
    hasMore: boolean
    nextBefore: number | null
  }
}

export type DirectStartResponse = {
  slug: string
  kind: 'direct'
  peer: {
    username: string
    profileImage: string | null
  }
}

export type DirectChatsResponse = {
  items: DirectChatListItem[]
}

export interface IApiService {
  /**
   * Выполняет метод `ensureCsrf`.
   * @returns Результат выполнения `ensureCsrf`.
   */

  ensureCsrf(): Promise<{ csrfToken: string }>
  ensurePresenceSession(): Promise<{ ok: boolean }>
  /**
   * Выполняет метод `getSession`.
   * @returns Результат выполнения `getSession`.
   */

  getSession(): Promise<SessionResponse>
  /**
   * Выполняет метод `login`.
   * @param username Входной параметр `username`.
   * @param password Входной параметр `password`.
   * @returns Результат выполнения `login`.
   */

  login(username: string, password: string): Promise<SessionResponse>
  /**
   * Выполняет метод `register`.
   * @param username Входной параметр `username`.
   * @param password1 Входной параметр `password1`.
   * @param password2 Входной параметр `password2`.
   * @returns Результат выполнения `register`.
   */

  register(username: string, password1: string, password2: string): Promise<SessionResponse>
  /**
   * Выполняет метод `getPasswordRules`.
   * @returns Результат выполнения `getPasswordRules`.
   */

  getPasswordRules(): Promise<{ rules: string[] }>
  /**
   * Выполняет метод `logout`.
   * @returns Результат выполнения `logout`.
   */

  logout(): Promise<{ ok: boolean }>
  /**
   * Выполняет метод `updateProfile`.
   * @param fields Входной параметр `fields`.
   * @returns Результат выполнения `updateProfile`.
   */

  updateProfile(fields: UpdateProfileInput): Promise<{ user: UserProfile }>
  /**
   * Выполняет метод `getPublicRoom`.
   * @returns Результат выполнения `getPublicRoom`.
   */

  getPublicRoom(): Promise<RoomDetails>
  /**
   * Выполняет метод `getRoomDetails`.
   * @param slug Входной параметр `slug`.
   * @returns Результат выполнения `getRoomDetails`.
   */

  getRoomDetails(slug: string): Promise<RoomDetails>
  /**
   * Выполняет метод `getRoomMessages`.
   * @param slug Входной параметр `slug`.
   * @returns Результат выполнения `getRoomMessages`.
   */

  getRoomMessages(
    slug: string,
    params?: { limit?: number; beforeId?: number },
  ): Promise<RoomMessagesResponse>
  /**
   * Выполняет метод `startDirectChat`.
   * @param username Входной параметр `username`.
   * @returns Результат выполнения `startDirectChat`.
   */

  startDirectChat(username: string): Promise<DirectStartResponse>
  /**
   * Выполняет метод `getDirectChats`.
   * @returns Результат выполнения `getDirectChats`.
   */

  getDirectChats(): Promise<DirectChatsResponse>
  /**
   * Выполняет метод `getUserProfile`.
   * @param username Входной параметр `username`.
   * @returns Результат выполнения `getUserProfile`.
   */

  getUserProfile(username: string): Promise<{ user: UserProfile }>
}
