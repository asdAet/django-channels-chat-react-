import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import type { UserProfile } from '../entities/user/types'
import { ChatRoomPage } from '../pages/ChatRoomPage'
import { DirectLayout } from '../pages/DirectLayout'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { ProfilePage } from '../pages/ProfilePage'
import { RegisterPage } from '../pages/RegisterPage'
import { UserProfilePage } from '../pages/UserProfilePage'

const ROOM_SLUG_RE = /^[A-Za-z0-9_-]{3,50}$/

type ProfileFieldErrors = Record<string, string[]>
type ProfileSaveResult =
  | { ok: true }
  | { ok: false; errors?: ProfileFieldErrors; message?: string }

type AppRoutesProps = {
  user: UserProfile | null
  error: string | null
  passwordRules: string[]
  onNavigate: (path: string) => void
  onLogin: (username: string, password: string) => Promise<void>
  onRegister: (username: string, password1: string, password2: string) => Promise<void>
  onLogout: () => Promise<void>
  onProfileSave: (fields: {
    username: string
    email: string
    image?: File | null
    bio?: string
  }) => Promise<ProfileSaveResult>
}

/**
 * Обертка для пользовательского профиля с получением username из URL.
 * @param props Данные пользователя и обработчики навигации.
 * @returns JSX-страница пользовательского профиля.
 */
function UserProfileRoute({
  user,
  onNavigate,
  onLogout,
}: Pick<AppRoutesProps, 'user' | 'onNavigate' | 'onLogout'>) {
  const params = useParams<{ username: string }>()
  const username = params.username ?? ''
  if (!username) {
    return <Navigate to="/" replace />
  }
  return (
    <UserProfilePage
      key={username}
      user={user}
      username={username}
      currentUser={user}
      onNavigate={onNavigate}
      onLogout={onLogout}
    />
  )
}

/**
 * Обертка для direct-чата по username из URL.
 * @param props Данные пользователя и обработчики навигации.
 * @returns JSX-страница direct-чата.
 */
function DirectByUsernameRoute({
  user,
  onNavigate,
}: Pick<AppRoutesProps, 'user' | 'onNavigate'>) {
  const params = useParams<{ username: string }>()
  const rawUsername = params.username ?? ''
  const username = rawUsername.startsWith('@') ? rawUsername.slice(1) : rawUsername
  if (!username) {
    return <Navigate to="/direct" replace />
  }
  return <DirectLayout user={user} username={username} onNavigate={onNavigate} />
}

/**
 * Обертка для комнаты с валидацией slug.
 * @param props Данные пользователя и обработчики навигации.
 * @returns JSX-страница комнаты либо redirect на главную.
 */
function RoomRoute({ user, onNavigate }: Pick<AppRoutesProps, 'user' | 'onNavigate'>) {
  const params = useParams<{ slug: string }>()
  const slug = params.slug ?? ''
  if (!ROOM_SLUG_RE.test(slug)) {
    return <Navigate to="/" replace />
  }
  return <ChatRoomPage key={slug} slug={slug} user={user} onNavigate={onNavigate} />
}

/**
 * Декларация всех frontend-маршрутов приложения.
 * @param props Состояние сессии и обработчики действий страниц.
 * @returns Набор Route-компонентов для BrowserRouter.
 */
export function AppRoutes({
  user,
  error,
  passwordRules,
  onNavigate,
  onLogin,
  onRegister,
  onLogout,
  onProfileSave,
}: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/" element={<HomePage user={user} onNavigate={onNavigate} />} />
      <Route
        path="/login"
        element={<LoginPage onSubmit={onLogin} onNavigate={onNavigate} error={error} />}
      />
      <Route
        path="/register"
        element={
          <RegisterPage
            onSubmit={onRegister}
            onNavigate={onNavigate}
            error={error}
            passwordRules={passwordRules}
          />
        }
      />
      <Route
        path="/profile"
        element={<ProfilePage key={user?.username || 'guest'} user={user} onSave={onProfileSave} onNavigate={onNavigate} />}
      />
      <Route path="/direct" element={<DirectLayout user={user} onNavigate={onNavigate} />} />
      <Route path="/direct/:username" element={<DirectByUsernameRoute user={user} onNavigate={onNavigate} />} />
      <Route
        path="/users/:username"
        element={<UserProfileRoute user={user} onNavigate={onNavigate} onLogout={onLogout} />}
      />
      <Route path="/rooms/:slug" element={<RoomRoute user={user} onNavigate={onNavigate} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
