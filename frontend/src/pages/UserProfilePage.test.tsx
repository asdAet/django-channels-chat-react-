import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '../entities/user/types'

const SEND_DM_LABEL = 'Отправить сообщение'

const profileMock = vi.hoisted(() => ({
  user: {
    username: 'alice',
    email: '',
    profileImage: null,
    bio: '',
    lastSeen: null as string | null,
    registeredAt: null,
  } as UserProfile,
  loading: false,
  error: null as string | null,
}))

vi.mock('../hooks/useUserProfile', () => ({
  useUserProfile: () => profileMock,
}))

const presenceMock = vi.hoisted(() => ({
  online: [] as Array<{ username: string; profileImage: string | null }>,
  guests: 0,
  status: 'online' as const,
  lastError: null as string | null,
}))

vi.mock('../shared/presence', () => ({
  usePresence: () => presenceMock,
}))

import { UserProfilePage } from './UserProfilePage'

const makeUser = (username: string) =>
  ({
    username,
    email: `${username}@example.com`,
    profileImage: null,
    bio: '',
    lastSeen: null as string | null,
    registeredAt: null,
  }) as UserProfile

describe('UserProfilePage', () => {
  beforeEach(() => {
    profileMock.user = {
      username: 'alice',
      email: '',
      profileImage: null,
      bio: '',
      lastSeen: null as string | null,
      registeredAt: null,
    }
    profileMock.loading = false
    profileMock.error = null
    presenceMock.online = []
    presenceMock.status = 'online'
    presenceMock.lastError = null
  })

  it('shows send message button only for foreign profile', () => {
    const onNavigate = vi.fn()
    render(
      <UserProfilePage
        user={makeUser('bob')}
        currentUser={makeUser('bob')}
        username="alice"
        onNavigate={onNavigate}
        onLogout={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: SEND_DM_LABEL }))
    expect(onNavigate).toHaveBeenCalledWith('/direct/@alice')
  })

  it('hides send message button for own profile', () => {
    render(
      <UserProfilePage
        user={makeUser('alice')}
        currentUser={makeUser('alice')}
        username="alice"
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: SEND_DM_LABEL })).toBeNull()
  })

  it('shows online label when user is online', () => {
    presenceMock.online = [{ username: 'alice', profileImage: null }]
    const { container } = render(
      <UserProfilePage
        user={makeUser('bob')}
        currentUser={makeUser('bob')}
        username="alice"
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
      />,
    )

    expect(container.querySelector('[data-online="true"]')).not.toBeNull()
  })

  it('shows last seen label when user is offline', () => {
    profileMock.user = {
      username: 'alice',
      email: '',
      profileImage: null,
      bio: '',
      lastSeen: '2026-02-13T10:00:00.000Z',
      registeredAt: null,
    }

    const { container } = render(
      <UserProfilePage
        user={makeUser('bob')}
        currentUser={makeUser('bob')}
        username="alice"
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
      />,
    )

    expect(container.querySelector('[data-online="true"]')).toBeNull()
  })
})

