import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '../entities/message/types'

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
  details: { slug: 'public', name: 'Public', kind: 'public', created: false, createdBy: null },
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

    chatRoomMock.details = { slug: 'public', name: 'Public', kind: 'public', created: false, createdBy: null }
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
    const { container } = render(
      <ChatRoomPage slug="public" user={null} onNavigate={vi.fn()} />,
    )

    expect(container.querySelector('.auth-callout')).toBeTruthy()
    expect(container.querySelector('.chat-input input')).toBeNull()
  })

  it('sends message for authenticated user', () => {
    const { container } = render(
      <ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />,
    )

    const input = container.querySelector('.chat-input input') as HTMLInputElement
    const submit = container.querySelector('.chat-input button') as HTMLButtonElement

    fireEvent.change(input, { target: { value: 'Hello from test' } })
    fireEvent.click(submit)

    expect(wsState.send).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(wsState.send.mock.calls[0][0])
    expect(payload.message).toBe('Hello from test')
    expect(payload.username).toBe('demo')
  })

  it('disables submit while websocket is not online', () => {
    wsState.status = 'connecting'

    const { container } = render(
      <ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />,
    )

    const input = container.querySelector('.chat-input input') as HTMLInputElement
    const submit = container.querySelector('.chat-input button') as HTMLButtonElement

    fireEvent.change(input, { target: { value: 'text' } })

    expect(submit.disabled).toBe(true)
  })

  it('activates local rate limit cooldown from ws error event', () => {
    const { container } = render(
      <ChatRoomPage slug="public" user={user} onNavigate={vi.fn()} />,
    )

    const input = container.querySelector('.chat-input input') as HTMLInputElement
    const submit = container.querySelector('.chat-input button') as HTMLButtonElement

    fireEvent.change(input, { target: { value: 'text' } })
    expect(submit.disabled).toBe(false)

    act(() => {
      wsState.options?.onMessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ error: 'rate_limited', retry_after: 2 }),
        }),
      )
    })

    expect(submit.disabled).toBe(true)
  })

  it('shows online status for direct peer', () => {
    chatRoomMock.details = {
      slug: 'dm_1',
      name: 'dm',
      kind: 'direct',
      created: false,
      createdBy: null,
      peer: { username: 'alice', profileImage: null, lastSeen: '2026-02-13T10:00:00.000Z' },
    }
    presenceMock.online = [{ username: 'alice', profileImage: null }]

    const { container } = render(
      <ChatRoomPage slug="dm_1" user={user} onNavigate={vi.fn()} />,
    )

    expect(container.textContent).toContain('В сети')
  })

  it('shows last seen for offline direct peer', () => {
    chatRoomMock.details = {
      slug: 'dm_2',
      name: 'dm',
      kind: 'direct',
      created: false,
      createdBy: null,
      peer: { username: 'bob', profileImage: null, lastSeen: '2026-02-13T10:00:00.000Z' },
    }
    presenceMock.online = []

    const { container } = render(
      <ChatRoomPage slug="dm_2" user={user} onNavigate={vi.fn()} />,
    )

    expect(container.textContent).toContain('Последний раз в сети:')
  })
})
