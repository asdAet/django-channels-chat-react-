import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const directInboxMock = vi.hoisted(() => ({
  unreadDialogsCount: 0,
  unreadCounts: {} as Record<string, number>,
}))

vi.mock('../../shared/directInbox', () => ({
  useDirectInbox: () => directInboxMock,
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
  })

  it('does not show direct chats button for guests', () => {
    const { container } = render(<TopBar user={null} onNavigate={vi.fn()} onLogout={vi.fn()} />)
    expect(container.querySelector('.link-with-badge')).toBeNull()
  })

  it('shows unread badge only for authenticated users', () => {
    directInboxMock.unreadDialogsCount = 2
    const { container } = render(<TopBar user={user} onNavigate={vi.fn()} onLogout={vi.fn()} />)

    const link = container.querySelector('.link-with-badge')
    expect(link).not.toBeNull()

    const badge = container.querySelector('.link-with-badge .badge')
    expect(badge?.textContent).toBe('2')
  })

  it('navigates to direct inbox when personal chats clicked', () => {
    const onNavigate = vi.fn()
    const { container } = render(<TopBar user={user} onNavigate={onNavigate} onLogout={vi.fn()} />)

    const directButton = container.querySelector('.link-with-badge')
    expect(directButton).not.toBeNull()
    fireEvent.click(directButton as Element)
    expect(onNavigate).toHaveBeenCalledWith('/direct')
  })
})
