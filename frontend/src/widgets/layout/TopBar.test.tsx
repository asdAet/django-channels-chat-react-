import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const directInboxMock = vi.hoisted(() => ({
  unreadDialogsCount: 0,
  unreadCounts: {} as Record<string, number>,
}))

const presenceMock = vi.hoisted(() => ({
  online: [] as Array<{ username: string; profileImage: string | null }>,
  guests: 0,
  status: 'online' as const,
  lastError: null as string | null,
}))

vi.mock('../../shared/directInbox', () => ({
  useDirectInbox: () => directInboxMock,
}))

vi.mock('../../shared/presence', () => ({
  usePresence: () => presenceMock,
}))

import { TopBar } from './TopBar'

const user = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: null,
}

describe('TopBar', () => {
  beforeEach(() => {
    directInboxMock.unreadDialogsCount = 0
    presenceMock.online = []
    presenceMock.status = 'online'
    presenceMock.lastError = null
  })

  it('does not show direct chats button for guests', () => {
    render(<TopBar user={null} onNavigate={vi.fn()} onLogout={vi.fn()} />)
    expect(screen.queryByTestId('direct-nav-button')).toBeNull()
  })

  it('shows unread badge only for authenticated users', () => {
    directInboxMock.unreadDialogsCount = 2
    presenceMock.online = [{ username: 'demo', profileImage: null }]
    const { container } = render(<TopBar user={user} onNavigate={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByTestId('direct-nav-button')).toBeInTheDocument()
    expect(screen.getByTestId('direct-unread-badge').textContent).toBe('2')
    expect(container.querySelector('[data-size="tiny"][data-online="true"]')).not.toBeNull()
  })

  it('navigates to direct inbox when personal chats clicked', () => {
    const onNavigate = vi.fn()
    render(<TopBar user={user} onNavigate={onNavigate} onLogout={vi.fn()} />)

    fireEvent.click(screen.getByTestId('direct-nav-button'))
    expect(onNavigate).toHaveBeenCalledWith('/direct')
  })
})

