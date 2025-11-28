import { fetchJson } from './http'
import type { Message, RoomDetails } from './types'

export const getPublicRoom = () => fetchJson<RoomDetails>('/chat/public-room/')

export const getRoomDetails = (slug: string) =>
  fetchJson<RoomDetails>(`/chat/rooms/${encodeURIComponent(slug)}/`)

export const getRoomMessages = (slug: string) =>
  fetchJson<{ messages: Message[] }>(`/chat/rooms/${encodeURIComponent(slug)}/messages/`)
