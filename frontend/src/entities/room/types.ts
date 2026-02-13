export type RoomKind = 'public' | 'private' | 'direct'

export type RoomPeer = {
  username: string
  profileImage: string | null
  lastSeen?: string | null
}

export type RoomDetails = {
  slug: string
  name: string
  kind: RoomKind
  peer?: RoomPeer | null
  created?: boolean
  createdBy?: string | null
}

export type DirectChatListItem = {
  slug: string
  peer: RoomPeer
  lastMessage: string
  lastMessageAt: string
}
