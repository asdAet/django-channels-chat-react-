import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfilePage } from './ProfilePage'

const presenceMock = vi.hoisted(() => ({
  online: [] as Array<{ username: string; profileImage: string | null }>,
  guests: 0,
  status: 'online' as const,
  lastError: null as string | null,
}))

vi.mock('../shared/presence', () => ({
  usePresence: () => presenceMock,
}))

const user = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: '2026-01-01T10:00:00.000Z',
}

describe('ProfilePage', () => {
  /**
   * Выполняет метод `beforeEach`.
   * @returns Результат выполнения `beforeEach`.
   */

  beforeEach(() => {
    presenceMock.online = []
    presenceMock.status = 'online'
    presenceMock.lastError = null
  })
  /**
   * Выполняет метод `it`.
   * @returns Результат выполнения `it`.
   */

  it('asks guest to login before editing profile', () => {
    const onNavigate = vi.fn()

    /**
     * Выполняет метод `render`.
     * @returns Результат выполнения `render`.
     */

    render(
      <ProfilePage
        user={null}
        onSave={vi.fn(async () => ({ ok: true }))}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    /**
     * Выполняет метод `expect`.
     * @param onNavigate Входной параметр `onNavigate`.
     * @returns Результат выполнения `expect`.
     */

    expect(onNavigate).toHaveBeenCalledWith('/login')
  })

  /**
   * Выполняет метод `it`.
   * @returns Результат выполнения `it`.
   */

  it('shows field-level validation errors from onSave', async () => {
    const onSave = vi.fn(async () => ({
      ok: false as const,
      errors: { username: ['Имя уже занято'] },
      message: 'Проверьте введённые данные и попробуйте снова.',
    }))

    /**
     * Выполняет метод `render`.
     * @returns Результат выполнения `render`.
     */

    render(
      <ProfilePage
        user={user}
        onSave={onSave}
        onNavigate={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      /**
       * Выполняет метод `expect`.
       * @returns Результат выполнения `expect`.
       */

      expect(screen.getByText('Имя уже занято')).toBeInTheDocument()
      /**
       * Выполняет метод `expect`.
       * @returns Результат выполнения `expect`.
       */

      expect(
        screen.getByText('Проверьте введённые данные и попробуйте снова.'),
      ).toBeInTheDocument()
    })
  })

  /**
   * Выполняет метод `it`.
   * @returns Результат выполнения `it`.
   */

  it('shows max-bio warning over 1000 chars', () => {
    /**
     * Выполняет метод `render`.
     * @returns Результат выполнения `render`.
     */

    render(
      <ProfilePage
        user={user}
        onSave={vi.fn(async () => ({ ok: true }))}
        onNavigate={vi.fn()}
      />,
    )

    const textarea = screen.getByLabelText('О себе')
    fireEvent.change(textarea, { target: { value: 'a'.repeat(1001) } })

    /**
     * Выполняет метод `expect`.
     * @returns Результат выполнения `expect`.
     */

    expect(screen.getByText('Максимум 1000 символов.')).toBeInTheDocument()
  })

  /**
   * Выполняет метод `it`.
   * @returns Результат выполнения `it`.
   */

  it('shows online label when current user is online', () => {
    presenceMock.online = [{ username: 'demo', profileImage: null }]

    /**
     * Выполняет метод `render`.
     * @returns Результат выполнения `render`.
     */

    const { container } = render(
      <ProfilePage
        user={user}
        onSave={vi.fn(async () => ({ ok: true }))}
        onNavigate={vi.fn()}
      />,
    )

    /**
     * Выполняет метод `expect`.
     * @returns Результат выполнения `expect`.
     */

    expect(screen.getByText('В сети')).toBeInTheDocument()
    expect(container.querySelector('[data-online="true"]')).not.toBeNull()
  })

  /**
   * Выполняет метод `it`.
   * @returns Результат выполнения `it`.
   */

  it('shows last seen label when current user is offline', () => {
    /**
     * Выполняет метод `render`.
     * @returns Результат выполнения `render`.
     */

    const { container } = render(
      <ProfilePage
        user={{ ...user, lastSeen: '2026-02-13T10:00:00.000Z' }}
        onSave={vi.fn(async () => ({ ok: true }))}
        onNavigate={vi.fn()}
      />,
    )

    /**
     * Выполняет метод `expect`.
     * @returns Результат выполнения `expect`.
     */

    expect(screen.getByText(/Последний раз в сети:/i)).toBeInTheDocument()
    expect(container.querySelector('[data-online="true"]')).toBeNull()
  })
})
