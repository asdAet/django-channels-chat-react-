import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const wsMock = vi.hoisted(() => ({
  status: 'online' as 'online' | 'offline' | 'error' | 'connecting' | 'idle' | 'closed',
  lastError: null as string | null,
  send: vi.fn<(payload: string) => boolean>(),
  options: null as
    | {
        url: string | null
        onMessage?: (event: MessageEvent) => void
      }
    | null,
}))

const chatMock = vi.hoisted(() => ({
  getDirectChats: vi.fn<() => Promise<{ items: Array<{ slug: string; peer: { username: string; profileImage: string | null }; lastMessage: string; lastMessageAt: string }> }>>(),
}))

vi.mock('../../controllers/ChatController', () => ({
  chatController: chatMock,
}))

vi.mock('../../hooks/useReconnectingWebSocket', () => ({
  useReconnectingWebSocket: (options: unknown) => {
    wsMock.options = options as { url: string | null; onMessage?: (event: MessageEvent) => void }
    return {
      status: wsMock.status,
      lastError: wsMock.lastError,
      send: wsMock.send,
      reconnect: vi.fn(),
    }
  },
}))

import { DirectInboxProvider } from './DirectInboxProvider'
import { useDirectInbox } from './useDirectInbox'

const user = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: null,
}

function Probe() {
  const inbox = useDirectInbox()

  return (
    <div>
      <p data-testid="loading">{String(inbox.loading)}</p>
      <p data-testid="unread-count">{inbox.unreadDialogsCount}</p>
      <p data-testid="unread-counts">{JSON.stringify(inbox.unreadCounts)}</p>
      <p data-testid="items-order">{inbox.items.map((item) => item.slug).join(',')}</p>
      <button onClick={() => inbox.setActiveRoom('dm_1')}>set-active</button>
      <button onClick={() => inbox.markRead('dm_1')}>mark-read</button>
    </div>
  )
}

const sentPayloads = () =>
  wsMock.send.mock.calls.map(([raw]) => {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

describe('DirectInboxProvider', () => {
  beforeEach(() => {
    wsMock.status = 'online'
    wsMock.lastError = null
    wsMock.send.mockReset().mockReturnValue(true)
    wsMock.options = null
    chatMock.getDirectChats.mockReset().mockResolvedValue({ items: [] })
  })

  it('loads initial chats and applies unread events', async () => {
    chatMock.getDirectChats.mockResolvedValue({
      items: [
        {
          slug: 'dm_1',
          peer: { username: 'alice', profileImage: null },
          lastMessage: 'hello',
          lastMessageAt: '2026-02-13T10:00:00Z',
        },
      ],
    })

    render(
      <DirectInboxProvider user={user}>
        <Probe />
      </DirectInboxProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('items-order').textContent).toBe('dm_1')
    })

    act(() => {
      wsMock.options?.onMessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'direct_unread_state',
            unread: { dialogs: 1, slugs: ['dm_1'], counts: { dm_1: 2 } },
          }),
        }),
      )
    })

    expect(screen.getByTestId('unread-count').textContent).toBe('1')
    expect(screen.getByTestId('unread-counts').textContent).toBe('{"dm_1":2}')

    act(() => {
      wsMock.options?.onMessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'direct_mark_read_ack',
            roomSlug: 'dm_1',
            unread: { dialogs: 0, slugs: [], counts: {} },
          }),
        }),
      )
    })

    expect(screen.getByTestId('unread-count').textContent).toBe('0')
    expect(screen.getByTestId('unread-counts').textContent).toBe('{}')
  })

  it('reorders chats when realtime item arrives', async () => {
    chatMock.getDirectChats.mockResolvedValue({
      items: [
        {
          slug: 'dm_old',
          peer: { username: 'alice', profileImage: null },
          lastMessage: 'old',
          lastMessageAt: '2026-02-13T10:00:00Z',
        },
        {
          slug: 'dm_new',
          peer: { username: 'bob', profileImage: null },
          lastMessage: 'new',
          lastMessageAt: '2026-02-13T11:00:00Z',
        },
      ],
    })

    render(
      <DirectInboxProvider user={user}>
        <Probe />
      </DirectInboxProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('items-order').textContent).toBe('dm_old,dm_new')
    })

    act(() => {
      wsMock.options?.onMessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'direct_inbox_item',
            item: {
              slug: 'dm_old',
              peer: { username: 'alice', profileImage: null },
              lastMessage: 'latest',
              lastMessageAt: '2026-02-13T12:00:00Z',
            },
            unread: { dialogs: 1, slugs: ['dm_old'], counts: { dm_old: 3 } },
          }),
        }),
      )
    })

    expect(screen.getByTestId('items-order').textContent).toBe('dm_old,dm_new')
    expect(screen.getByTestId('unread-count').textContent).toBe('1')
    expect(screen.getByTestId('unread-counts').textContent).toBe('{"dm_old":3}')
  })

  it('sends mark_read and set_active_room commands', async () => {
    render(
      <DirectInboxProvider user={user}>
        <Probe />
      </DirectInboxProvider>,
    )

    await waitFor(() => {
      expect(chatMock.getDirectChats).toHaveBeenCalledTimes(1)
    })

    act(() => {
      wsMock.options?.onMessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'direct_unread_state',
            unread: { dialogs: 1, slugs: ['dm_1'], counts: { dm_1: 1 } },
          }),
        }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'mark-read' }))
    fireEvent.click(screen.getByRole('button', { name: 'set-active' }))

    const payloads = sentPayloads()
    expect(payloads.some((payload) => payload?.type === 'mark_read' && payload?.roomSlug === 'dm_1')).toBe(true)
    expect(payloads.some((payload) => payload?.type === 'set_active_room' && payload?.roomSlug === 'dm_1')).toBe(true)
    expect(screen.getByTestId('unread-count').textContent).toBe('0')
    expect(screen.getByTestId('unread-counts').textContent).toBe('{}')
  })

  it('re-sends active room after reconnect', async () => {
    wsMock.status = 'offline'

    const { rerender } = render(
      <DirectInboxProvider user={user}>
        <Probe />
      </DirectInboxProvider>,
    )

    await waitFor(() => {
      expect(chatMock.getDirectChats).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'set-active' }))
    wsMock.send.mockClear()

    wsMock.status = 'online'
    rerender(
      <DirectInboxProvider user={user}>
        <Probe />
      </DirectInboxProvider>,
    )

    const payloads = sentPayloads()
    expect(payloads.some((payload) => payload?.type === 'ping')).toBe(true)
    expect(payloads.some((payload) => payload?.type === 'set_active_room' && payload?.roomSlug === 'dm_1')).toBe(true)
  })
})
