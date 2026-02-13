import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authControllerMock = vi.hoisted(() => ({
  ensureCsrf: vi.fn<() => Promise<{ csrfToken: string }>>(),
  getSession: vi.fn<() => Promise<{ authenticated: boolean; user: any }>>(),
  login: vi.fn<(dto: { username: string; password: string }) => Promise<{ authenticated: boolean; user: any }>>(),
  register: vi.fn<
    (dto: { username: string; password1: string; password2: string }) => Promise<{ authenticated: boolean; user: any }>
  >(),
  logout: vi.fn<() => Promise<{ ok: boolean }>>(),
  updateProfile: vi.fn<(dto: any) => Promise<{ user: any }>>(),
}))

vi.mock('../controllers/AuthController', () => ({
  authController: authControllerMock,
}))

import { useAuth } from './useAuth'

const sessionUser = {
  username: 'demo',
  email: 'demo@example.com',
  profileImage: null,
  bio: '',
  lastSeen: null,
  registeredAt: null,
}

describe('useAuth', () => {
  beforeEach(() => {
    authControllerMock.ensureCsrf.mockReset().mockResolvedValue({ csrfToken: 'token' })
    authControllerMock.getSession.mockReset().mockResolvedValue({ authenticated: true, user: sessionUser })
    authControllerMock.login.mockReset().mockResolvedValue({ authenticated: true, user: sessionUser })
    authControllerMock.register.mockReset().mockResolvedValue({ authenticated: true, user: sessionUser })
    authControllerMock.logout.mockReset().mockResolvedValue({ ok: true })
    authControllerMock.updateProfile.mockReset().mockResolvedValue({ user: { ...sessionUser, bio: 'updated' } })
  })

  it('loads session on mount', async () => {
    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.auth.loading).toBe(false))

    expect(authControllerMock.ensureCsrf).toHaveBeenCalledTimes(1)
    expect(authControllerMock.getSession).toHaveBeenCalledTimes(1)
    expect(result.current.auth.user?.username).toBe('demo')
  })

  it('falls back to guest state when session request fails', async () => {
    authControllerMock.getSession.mockRejectedValueOnce(new Error('session failed'))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.auth.loading).toBe(false))
    expect(result.current.auth.user).toBeNull()
  })

  it('login and register refresh auth user', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.auth.loading).toBe(false))

    await act(async () => {
      await result.current.login({ username: 'demo', password: 'pass12345' })
      await result.current.register({ username: 'demo', password1: 'pass12345', password2: 'pass12345' })
    })

    expect(authControllerMock.login).toHaveBeenCalledWith({ username: 'demo', password: 'pass12345' })
    expect(authControllerMock.register).toHaveBeenCalledWith({
      username: 'demo',
      password1: 'pass12345',
      password2: 'pass12345',
    })
    expect(result.current.auth.user?.username).toBe('demo')
  })

  it('logout clears auth user even when api fails', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.auth.loading).toBe(false))

    authControllerMock.logout.mockRejectedValueOnce(new Error('network'))

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.auth.user).toBeNull()
  })

  it('updateProfile normalizes empty profile image', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.auth.loading).toBe(false))

    authControllerMock.updateProfile.mockResolvedValueOnce({
      user: {
        ...sessionUser,
        profileImage: '',
      },
    })

    await act(async () => {
      await result.current.updateProfile({ username: 'demo', email: '' })
    })

    expect(result.current.auth.user?.profileImage).toBeNull()
  })

  it('updateProfile drops user on 401', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.auth.loading).toBe(false))

    authControllerMock.updateProfile.mockRejectedValueOnce({
      status: 401,
      message: 'Unauthorized',
    })

    let thrown: unknown = null
    await act(async () => {
      try {
        await result.current.updateProfile({ username: 'demo', email: '' })
      } catch (error) {
        thrown = error
      }
    })

    expect(thrown).toMatchObject({ status: 401 })
    await waitFor(() => expect(result.current.auth.user).toBeNull())
  })
})