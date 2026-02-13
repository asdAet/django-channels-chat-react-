import { apiService } from '../adapters/ApiService'
import type {
  DirectChatsResponseDto,
  DirectStartResponseDto,
  RoomDetailsDto,
  RoomMessagesDto,
  RoomMessagesParams,
} from '../dto/chat'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const PUBLIC_ROOM_TTL_MS = 60_000
const ROOM_DETAILS_TTL_MS = 30_000
const ROOM_MESSAGES_TTL_MS = 15_000
const DIRECT_CHATS_TTL_MS = 15_000
const MAX_MESSAGE_CACHE_ENTRIES = 320

const roomDetailsCache = new Map<string, CacheEntry<RoomDetailsDto>>()
const roomMessagesCache = new Map<string, CacheEntry<RoomMessagesDto>>()

let publicRoomEntry: CacheEntry<RoomDetailsDto> | null = null
let publicRoomInFlight: Promise<RoomDetailsDto> | null = null

let directChatsEntry: CacheEntry<DirectChatsResponseDto> | null = null
let directChatsInFlight: Promise<DirectChatsResponseDto> | null = null

const roomDetailsInFlight = new Map<string, Promise<RoomDetailsDto>>()
const roomMessagesInFlight = new Map<string, Promise<RoomMessagesDto>>()

const now = () => Date.now()

const hasFreshEntry = <T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> =>
  Boolean(entry && entry.expiresAt > now())

const pruneMessagesCache = () => {
  while (roomMessagesCache.size > MAX_MESSAGE_CACHE_ENTRIES) {
    const oldestKey = roomMessagesCache.keys().next().value
    if (!oldestKey) break
    roomMessagesCache.delete(oldestKey)
  }
}

const buildRoomMessagesKey = (slug: string, params?: RoomMessagesParams) => {
  const limit = params?.limit ?? ''
  const beforeId = params?.beforeId ?? ''
  return `${slug}|limit=${limit}|before=${beforeId}`
}

class ChatController {
  public async getPublicRoom(): Promise<RoomDetailsDto> {
    if (hasFreshEntry(publicRoomEntry)) {
      return publicRoomEntry.value
    }

    if (publicRoomInFlight) {
      return publicRoomInFlight
    }

    publicRoomInFlight = apiService
      .getPublicRoom()
      .then((value) => {
        publicRoomEntry = { value, expiresAt: now() + PUBLIC_ROOM_TTL_MS }
        return value
      })
      .finally(() => {
        publicRoomInFlight = null
      })

    return publicRoomInFlight
  }

  public async getRoomDetails(slug: string): Promise<RoomDetailsDto> {
    const cached = roomDetailsCache.get(slug)
    if (hasFreshEntry(cached)) {
      return cached.value
    }

    const inFlight = roomDetailsInFlight.get(slug)
    if (inFlight) {
      return inFlight
    }

    const request = apiService
      .getRoomDetails(slug)
      .then((value) => {
        roomDetailsCache.set(slug, { value, expiresAt: now() + ROOM_DETAILS_TTL_MS })
        return value
      })
      .finally(() => {
        roomDetailsInFlight.delete(slug)
      })

    roomDetailsInFlight.set(slug, request)
    return request
  }

  public async getRoomMessages(slug: string, params?: RoomMessagesParams): Promise<RoomMessagesDto> {
    const cacheKey = buildRoomMessagesKey(slug, params)
    const cached = roomMessagesCache.get(cacheKey)
    if (hasFreshEntry(cached)) {
      return cached.value
    }

    const inFlight = roomMessagesInFlight.get(cacheKey)
    if (inFlight) {
      return inFlight
    }

    const request = apiService
      .getRoomMessages(slug, params)
      .then((value) => {
        roomMessagesCache.set(cacheKey, { value, expiresAt: now() + ROOM_MESSAGES_TTL_MS })
        pruneMessagesCache()
        return value
      })
      .finally(() => {
        roomMessagesInFlight.delete(cacheKey)
      })

    roomMessagesInFlight.set(cacheKey, request)
    return request
  }

  public async startDirectChat(username: string): Promise<DirectStartResponseDto> {
    const response = await apiService.startDirectChat(username)
    directChatsEntry = null
    return response
  }

  public async getDirectChats(): Promise<DirectChatsResponseDto> {
    if (hasFreshEntry(directChatsEntry)) {
      return directChatsEntry.value
    }

    if (directChatsInFlight) {
      return directChatsInFlight
    }

    directChatsInFlight = apiService
      .getDirectChats()
      .then((value) => {
        directChatsEntry = { value, expiresAt: now() + DIRECT_CHATS_TTL_MS }
        return value
      })
      .finally(() => {
        directChatsInFlight = null
      })

    return directChatsInFlight
  }
}

export const chatController = new ChatController()
