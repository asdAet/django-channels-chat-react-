import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { usePasswordRules } from '../hooks/usePasswordRules'
import type { ApiError } from '../shared/api/types'
import { debugLog } from '../shared/lib/debug'
import { PresenceProvider } from '../shared/presence'
import { DirectInboxProvider } from '../shared/directInbox'
import { Toast } from '../shared/ui'
import { TopBar } from '../widgets/layout/TopBar'
import { AppRoutes } from './routes'
import styles from '../styles/pages/AppShell.module.css'

type ProfileFieldErrors = Record<string, string[]>
type ProfileSaveResult =
  | { ok: true }
  | { ok: false; errors?: ProfileFieldErrors; message?: string }

/**
 * Внутренний роутинг-слой приложения с глобальными провайдерами и баннерами.
 * @returns JSX-разметка основного shell приложения.
 */
function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { auth, login, register, logout, updateProfile } = useAuth()
  const { rules: passwordRules } = usePasswordRules(location.pathname === '/register')
  const [banner, setBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!banner) return
    const timerId = window.setTimeout(() => setBanner(null), 4200)
    return () => window.clearTimeout(timerId)
  }, [banner])

  const extractMessage = (err: unknown) => {
    if (err && typeof err === 'object' && 'message' in err && typeof (err as ApiError).message === 'string') {
      const apiErr = err as ApiError
      const apiErrors = apiErr.data && (apiErr.data.errors as Record<string, string[]> | undefined)
      if (apiErrors) {
        return Object.values(apiErrors).flat().join(' ')
      }
      if (apiErr.status === 400 && apiErr.message?.includes('status code 400')) {
        return 'Проверьте введённые данные и попробуйте снова.'
      }
      return apiErr.message
    }
    return 'Не удалось выполнить запрос. Попробуйте еще раз.'
  }

  const extractAuthMessage = (err: unknown, fallback: string) => {
    const extractFromData = (data: unknown) => {
      if (!data || typeof data !== 'object') return null
      const record = data as Record<string, unknown>
      const errors = record.errors as Record<string, string[] | string> | undefined
      if (errors) {
        const parts = Object.values(errors)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .filter((value) => typeof value === 'string') as string[]
        if (parts.length) return parts.join(' ')
      }
      if (typeof record.error === 'string') return record.error
      if (typeof record.detail === 'string') return record.detail
      return null
    }

    if (err && typeof err === 'object') {
      const anyErr = err as ApiError & { response?: { data?: unknown } }
      const direct = extractFromData(anyErr.data) || extractFromData(anyErr.response?.data)
      if (direct) return direct

      if ('message' in anyErr) {
        const rawMessage = typeof anyErr.message === 'string' ? anyErr.message.trim() : ''
        if (rawMessage && !rawMessage.includes('status code 400')) {
          return rawMessage
        }
        if (anyErr.status === 400) {
          return fallback
        }
      }
    }
    return fallback
  }

  const extractProfileErrors = (err: unknown): ProfileFieldErrors | null => {
    if (!err || typeof err !== 'object') return null
    const anyErr = err as ApiError & { response?: { data?: unknown } }
    const data = (anyErr.data ?? anyErr.response?.data) as Record<string, unknown> | undefined
    const rawErrors = data && (data.errors as Record<string, unknown> | undefined)
    if (!rawErrors || typeof rawErrors !== 'object') return null

    const normalized: ProfileFieldErrors = {}
    for (const [field, value] of Object.entries(rawErrors)) {
      if (Array.isArray(value)) {
        const messages = value.filter((item) => typeof item === 'string') as string[]
        if (messages.length) normalized[field] = messages
      } else if (typeof value === 'string') {
        normalized[field] = [value]
      }
    }
    return Object.keys(normalized).length ? normalized : null
  }

  const onNavigate = useCallback(
    (path: string) => {
      navigate(path)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [navigate],
  )

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      setError(null)
      try {
        await login({ username, password })
        setBanner('Добро пожаловать обратно!')
        onNavigate('/')
      } catch (err) {
        debugLog('Login failed', err)
        setError(extractAuthMessage(err, 'Неверный логин или пароль'))
      }
    },
    [login, onNavigate],
  )

  const handleRegister = useCallback(
    async (username: string, password1: string, password2: string) => {
      setError(null)
      try {
        await register({ username, password1, password2 })
        setBanner('Аккаунт создан. Можно общаться!')
        onNavigate('/')
      } catch (err) {
        debugLog('Registration failed', err)
        setError(extractAuthMessage(err, 'Проверьте данные регистрации'))
      }
    },
    [onNavigate, register],
  )

  const handleLogout = useCallback(async () => {
    await logout()
    setBanner('Вы вышли из аккаунта')
    onNavigate('/login')
  }, [logout, onNavigate])

  const handleProfileSave = useCallback(
    async (fields: { username: string; email: string; image?: File | null; bio?: string }): Promise<ProfileSaveResult> => {
      if (!auth.user) return { ok: false, message: 'Сначала войдите в аккаунт.' }
      setError(null)
      try {
        await updateProfile(fields)
        setBanner('Профиль обновлен')
        const nextUsername = fields.username?.trim() || auth.user?.username
        if (nextUsername) {
          onNavigate(`/users/${encodeURIComponent(nextUsername)}`)
        }
        return { ok: true }
      } catch (err) {
        debugLog('Profile update failed', err)
        const apiErr = err as ApiError

        if (apiErr && typeof apiErr.status === 'number' && apiErr.status === 401) {
          setError('Сессия истекла. Войдите снова.')
          onNavigate('/login')
          return { ok: false, message: 'Сессия истекла. Войдите снова.' }
        }

        if (apiErr && typeof apiErr.status === 'number' && apiErr.status === 413) {
          return {
            ok: false,
            errors: { image: ['Файл слишком большой. Максимум 20 МБ.'] },
            message: 'Файл слишком большой. Максимум 20 МБ.',
          }
        }

        const fieldErrors = extractProfileErrors(err)
        if (fieldErrors) {
          return { ok: false, errors: fieldErrors }
        }

        return { ok: false, message: extractMessage(err) }
      }
    },
    [auth.user, onNavigate, updateProfile],
  )

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register'

  return (
    <PresenceProvider user={auth.user} ready={!auth.loading}>
      <DirectInboxProvider user={auth.user} ready={!auth.loading}>
        <div className={styles.appShell}>
          <TopBar user={auth.user} onNavigate={onNavigate} onLogout={handleLogout} />
          <main className={styles.content}>
            {banner && (
              <Toast variant="success" role="status">
                {banner}
              </Toast>
            )}
            {error && !isAuthRoute && (
              <Toast variant="danger" role="alert">
                {error}
              </Toast>
            )}
            <AppRoutes
              user={auth.user}
              error={error}
              passwordRules={passwordRules}
              onNavigate={onNavigate}
              onLogin={handleLogin}
              onRegister={handleRegister}
              onLogout={handleLogout}
              onProfileSave={handleProfileSave}
            />
          </main>
        </div>
      </DirectInboxProvider>
    </PresenceProvider>
  )
}

/**
 * Корневой компонент frontend-приложения.
 * @returns JSX-разметка с BrowserRouter.
 */
export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
