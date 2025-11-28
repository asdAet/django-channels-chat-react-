import type { ApiError } from './types'

let csrfTokenCache: string | null = null

const API_BASE = '/api'

const getCookie = (name: string) => {
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1]
}

export const getCsrfToken = () => csrfTokenCache || getCookie('csrftoken')
export const setCsrfToken = (token: string | null) => {
  csrfTokenCache = token
}

const parseJson = (text: string) => {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (err) {
    console.warn('[Debug] Failed to parse JSON', err)
    return {}
  }
}

export async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  const method = (options.method || 'GET').toUpperCase()

  const shouldSendJson = !(options.body instanceof FormData) && method !== 'GET'
  if (shouldSendJson && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (method !== 'GET' && !headers.has('X-CSRFToken')) {
    const csrf = getCsrfToken()
    if (csrf) headers.set('X-CSRFToken', csrf)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  const data = parseJson(await response.text())
  if (!response.ok) {
    const errors = data && (data.errors as Record<string, string[]> | undefined)
    const errorText = errors
      ? Object.values(errors)
          .flat()
          .join(' ')
      : undefined
    const message =
      errorText ||
      (data && (data.error as string)) ||
      (data && (data.detail as string)) ||
      'Request failed'
    const error: ApiError = { status: response.status, message, data }
    throw error
  }

  return data as T
}
