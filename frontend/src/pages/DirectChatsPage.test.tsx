import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const inboxMock = vi.hoisted(() => ({
  items: [] as Array<{
    slug: string
    peer: { username: string; profileImage: string | null }
    lastMessage: string
    lastMessageAt: string
  }>,
  loading: false,
  error: null as string | null,
  unreadSlugs: [] as string[],
  unreadCounts: {} as Record<string, number>,
  unreadDialogsCount: 0,
  status: 'online' as const,
  setActiveRoom: vi.fn<(roomSlug: string | null) => void>(),
  markRead: vi.fn<(roomSlug: string) => void>(),
  refresh: vi.fn<() => Promise<void>>(),
}))

vi.mock('../shared/directInbox', () => ({
  useDirectInbox: () => inboxMock,
}))

import { DirectChatsPage } from './DirectChatsPage'

const user = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: null,
}

describe('DirectChatsPage', () => {
  beforeEach(() => {
    inboxMock.items = []
    inboxMock.loading = false
    inboxMock.error = null
    inboxMock.unreadCounts = {}
    inboxMock.setActiveRoom.mockReset()
    inboxMock.refresh.mockReset().mockResolvedValue(undefined)
  })

  it('shows auth prompt for guests', () => {
    const onNavigate = vi.fn()
    render(<DirectChatsPage user={null} onNavigate={onNavigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(onNavigate).toHaveBeenCalledWith('/login')
  })

  it('shows empty state', () => {
    render(<DirectChatsPage user={user} onNavigate={vi.fn()} />)

    expect(screen.getByText('Пока нет личных сообщений')).toBeInTheDocument()
    expect(inboxMock.refresh).toHaveBeenCalledTimes(1)
    expect(inboxMock.setActiveRoom).toHaveBeenCalledWith(null)
  })

  it('navigates to direct chat item', () => {
    const onNavigate = vi.fn()
    inboxMock.items = [
      {
        slug: 'dm_123',
        peer: { username: 'alice', profileImage: null },
        lastMessage: 'hello',
        lastMessageAt: '2026-01-01T10:00:00.000Z',
      },
    ]
    inboxMock.unreadCounts = { dm_123: 2 }

    render(<DirectChatsPage user={user} onNavigate={onNavigate} />)

    const button = screen.getByRole('button', { name: /alice/i })
    fireEvent.click(button)

    expect(onNavigate).toHaveBeenCalledWith('/direct/@alice')
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
