import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const publicRoomMock = vi.hoisted(() => ({
  room: { slug: 'public', name: 'Public', kind: 'public', created: false, createdBy: null },
  loading: false,
}))

const chatActionsMock = vi.hoisted(() => ({
  getRoomDetails: vi.fn(),
  getRoomMessages: vi.fn(),
}))

const presenceMock = vi.hoisted(() => ({
  online: [] as Array<{ username: string; profileImage: string | null }>,
  guests: 0,
  status: 'online',
  lastError: null as string | null,
}))

vi.mock('../hooks/usePublicRoom', () => ({
  usePublicRoom: () => ({ publicRoom: publicRoomMock.room, loading: publicRoomMock.loading }),
}))

vi.mock('../hooks/useChatActions', () => ({
  useChatActions: () => chatActionsMock,
}))

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true,
}))

vi.mock('../hooks/useReconnectingWebSocket', () => ({
  useReconnectingWebSocket: () => ({
    status: 'online',
    lastError: null,
    send: vi.fn(),
    reconnect: vi.fn(),
  }),
}))

vi.mock('../shared/presence', () => ({
  usePresence: () => presenceMock,
}))

import { HomePage } from './HomePage'

const user = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: null,
}

describe('HomePage', () => {
  beforeEach(() => {
    publicRoomMock.room = { slug: 'public', name: 'Public', kind: 'public', created: false, createdBy: null }
    publicRoomMock.loading = false

    chatActionsMock.getRoomDetails.mockReset()
    chatActionsMock.getRoomMessages.mockReset().mockResolvedValue({
      messages: [],
      pagination: { limit: 4, hasMore: false, nextBefore: null },
    })

    presenceMock.online = []
    presenceMock.guests = 0
    presenceMock.status = 'online'
    presenceMock.lastError = null
  })

  it('shows guest info prompt for unauthenticated user', async () => {
    render(<HomePage user={null} onNavigate={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByText('Войдите, чтобы видеть участников онлайн.')).toBeInTheDocument(),
    )
    expect(screen.getByText('Гостей онлайн')).toBeInTheDocument()
  })

  it('shows presence loading for authenticated user while ws connecting', async () => {
    presenceMock.status = 'connecting'

    render(<HomePage user={user} onNavigate={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByText('Загружаем список онлайн...')).toBeInTheDocument(),
    )
  })

  it('opens user profile from online list', async () => {
    const onNavigate = vi.fn()
    presenceMock.online = [{ username: 'alice', profileImage: null }]

    render(<HomePage user={user} onNavigate={onNavigate} />)

    const button = await screen.findByRole('button', {
      name: 'Открыть профиль пользователя alice',
    })
    fireEvent.click(button)

    expect(onNavigate).toHaveBeenCalledWith('/users/alice')
  })
})