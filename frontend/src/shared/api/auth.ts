import { fetchJson, setCsrfToken } from './http'
import type { SessionResponse, UserProfile } from './types'

export const ensureCsrf = () =>
  fetchJson<{ csrfToken: string }>('/auth/csrf/').then((res) => {
    setCsrfToken(res.csrfToken || null)
    return res
  })

export const getSession = () => fetchJson<SessionResponse>('/auth/session/')

export const login = (username: string, password: string) =>
  fetchJson<SessionResponse>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const register = (username: string, password1: string, password2: string) =>
  fetchJson<SessionResponse>('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({ username, password1, password2 }),
  })

export const logout = () => fetchJson<{ ok: boolean }>('/auth/logout/', { method: 'POST' })

export const updateProfile = (fields: {
  username: string
  email: string
  firstName: string
  lastName: string
  image?: File | null
}) => {
  const form = new FormData()
  form.append('username', fields.username)
  form.append('email', fields.email)
  form.append('first_name', fields.firstName)
  form.append('last_name', fields.lastName)
  if (fields.image) {
    form.append('image', fields.image)
  }

  return fetchJson<{ user: UserProfile }>('/auth/profile/', {
    method: 'POST',
    body: form,
  })
}
