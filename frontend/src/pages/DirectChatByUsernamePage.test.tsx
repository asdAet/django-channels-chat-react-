import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const controllerMock = vi.hoisted(() => ({
  startDirectChat: vi.fn(),
}))

vi.mock('../controllers/ChatController', () => ({
  chatController: controllerMock,
}))

vi.mock('./ChatRoomPage', () => ({
  ChatRoomPage: ({ slug }: { slug: string }) => <div>CHAT:{slug}</div>,
}))

import { DirectChatByUsernamePage } from './DirectChatByUsernamePage'

const user = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: null,
}

describe('DirectChatByUsernamePage', () => {
  beforeEach(() => {
    controllerMock.startDirectChat.mockReset()
  })

  it('shows auth prompt for guests', () => {
    const onNavigate = vi.fn()
    render(<DirectChatByUsernamePage user={null} username="alice" onNavigate={onNavigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(onNavigate).toHaveBeenCalledWith('/login')
  })

  it('shows not found state when username is missing', async () => {
    controllerMock.startDirectChat.mockRejectedValue({ status: 404, message: 'not found' })
    render(<DirectChatByUsernamePage user={user} username="missing" onNavigate={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Пользователь не найден')).toBeInTheDocument()
    })
  })

  it('renders chat page when direct chat is resolved', async () => {
    controllerMock.startDirectChat.mockResolvedValue({
      slug: 'dm_123',
      kind: 'direct',
      peer: { username: 'alice', profileImage: null },
    })

    render(<DirectChatByUsernamePage user={user} username="alice" onNavigate={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('CHAT:dm_123')).toBeInTheDocument()
    })
  })
})

