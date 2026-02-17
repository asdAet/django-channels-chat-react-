import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '../entities/message/types'
import type { RoomDetails } from '../entities/room/types'

const wsState = vi.hoisted(() => ({
  status: 'online' as 'online' | 'connecting' | 'offline' | 'error' | 'closed',
  lastError: null as string | null,
  send: vi.fn<(payload: string) => boolean>(),
  options: null as
    | {
        onMessage?: (event: MessageEvent) => void
      }
    | null,
}))

const chatRoomMock = vi.hoisted(() => ({
  details: { slug: 'public', name: 'Public', kind: 'public', created: false, createdBy: null } as RoomDetails,
  messages: [] as Message[],
  loading: false,
  loadingMore: false,
  hasMore: false,
  error: null as string | null,
  loadMore: vi.fn(),
  setMessages: vi.fn(),
}))

const presenceMock = vi.hoisted(() => ({
  online: [] as Array<{ username: string; profileImage: string | null }>,
  guests: 0,
  status: 'online' as const,
  lastError: null as string | null,
}))

vi.mock('../hooks/useChatRoom', () => ({
  useChatRoom: () => chatRoomMock,
}))

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('../hooks/useReconnectingWebSocket', () => ({
  useReconnectingWebSocket: (options: unknown) => {
    wsState.options = options as { onMessage?: (event: MessageEvent) => void }
    return {
      status: wsState.status,
      lastError: wsState.lastError,
      send: wsState.send,
      reconnect: vi.fn(),
    }
  },
}))

vi.mock('../shared/presence', () => ({
  usePresence: () => presenceMock,
}))

import { ChatRoomPage } from './ChatRoomPage'

const user = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: null,
}

describe('ChatRoomPage', () => {
  beforeEach(() => {
    wsState.status = 'online'
    wsState.lastError = null
    wsState.send.mockReset().mockReturnValue(true)
    wsState.options = null

    chatRoomMock.details = { slug: 'public', name: 'Public', kind: 'public', created: false, createdBy: null } as RoomDetails
    chatRoomMock.messages = []
    chatRoomMock.loading = false
    chatRoomMock.loadingMore = false
    chatRoomMock.hasMore = false
    chatRoomMock.error = null
    chatRoomMock.loadMore.mockReset()
    chatRoomMock.setMessages.mockReset()
    presenceMock.online = []
    presenceMock.status = 'online'
    presenceMock.lastError = null
  })

  it('shows read-only mode for guest in public room', () => {
    render(<ChatRoomPage slug="public" user={null} onNavigate={vi.fn()} />)

    expect(
      screen.getByText('Чтобы писать в публичном чате, войдите или зарегистрируйтесь.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Сообщение')).toBeNull()
  })

  it('sends message for authenticated user', () => {
    render(<ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Сообщение'), {
      target: { value: 'Hello from test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }))

    expect(wsState.send).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(wsState.send.mock.calls[0][0])
    expect(payload.message).toBe('Hello from test')
    expect(payload.username).toBe('demo')
  })

  it('disables submit while websocket is not online', () => {
    wsState.status = 'connecting'

    render(<ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'text' } })

    expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeDisabled()
  })

  it('activates local rate limit cooldown from ws error event', () => {
    render(<ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: 'text' } })
    expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeEnabled()

    act(() => {
      wsState.options?.onMessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ error: 'rate_limited', retry_after: 2 }),
        }),
      )
    })

    expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeDisabled()
  })

  it('shows online status for direct peer', () => {
    chatRoomMock.details = {
      slug: 'dm_1',
      name: 'dm',
      kind: 'direct',
      created: false,
      createdBy: null,
      peer: { username: 'alice', profileImage: null, lastSeen: '2026-02-13T10:00:00.000Z' },
    } as RoomDetails
    presenceMock.online = [{ username: 'alice', profileImage: null }]

    render(<ChatRoomPage slug="dm_1" user={user} onNavigate={vi.fn()} />)
    expect(screen.getByText('В сети')).toBeInTheDocument()
  })

  it('shows last seen for offline direct peer', () => {
    chatRoomMock.details = {
      slug: 'dm_2',
      name: 'dm',
      kind: 'direct',
      created: false,
      createdBy: null,
      peer: { username: 'bob', profileImage: null, lastSeen: '2026-02-13T10:00:00.000Z' },
    } as RoomDetails
    presenceMock.online = []

    render(<ChatRoomPage slug="dm_2" user={user} onNavigate={vi.fn()} />)
    expect(screen.getByText(/Последний раз в сети:/i)).toBeInTheDocument()
  })

  it('shows online badge on message avatar for online user', () => {
    chatRoomMock.messages = [
      {
        id: 1,
        username: 'alice',
        content: 'hi',
        profilePic: null,
        createdAt: '2026-02-13T10:00:00.000Z',
      },
    ]
    presenceMock.online = [{ username: 'alice', profileImage: null }]

    const { container } = render(<ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />)
    expect(container.querySelector('[data-size="small"][data-online="true"]')).not.toBeNull()
  })

  it('does not show online badge on message avatar for offline user', () => {
    chatRoomMock.messages = [
      {
        id: 2,
        username: 'bob',
        content: 'offline',
        profilePic: null,
        createdAt: '2026-02-13T11:00:00.000Z',
      },
    ]
    presenceMock.online = []

    const { container } = render(<ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />)
    expect(container.querySelector('[data-size="small"][data-online="true"]')).toBeNull()
  })
})

