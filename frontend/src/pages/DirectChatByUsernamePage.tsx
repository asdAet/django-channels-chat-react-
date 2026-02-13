import { useEffect, useMemo, useState } from 'react'

import type { ApiError } from '../shared/api/types'
import { chatController } from '../controllers/ChatController'
import type { UserProfile } from '../entities/user/types'
import { debugLog } from '../shared/lib/debug'
import { ChatRoomPage } from './ChatRoomPage'

type Props = {
  user: UserProfile | null
  username: string
  onNavigate: (path: string) => void
}

type DirectChatState = {
  key: string
  slug: string | null
  error: string | null
}

export function DirectChatByUsernamePage({ user, username, onNavigate }: Props) {
  const requestKey = useMemo(() => (user ? `${user.username}:${username}` : 'guest'), [user, username])

  const [state, setState] = useState<DirectChatState>(() => ({
    key: 'guest',
    slug: null,
    error: null,
  }))

  useEffect(() => {
    if (!user) return

    let active = true

    chatController
      .startDirectChat(username)
      .then((payload) => {
        if (!active) return
        setState({ key: requestKey, slug: payload.slug, error: null })
      })
      .catch((err) => {
        if (!active) return
        debugLog('Direct start failed', err)
        const apiErr = err as ApiError
        if (apiErr.status === 404) {
          setState({ key: requestKey, slug: null, error: 'Пользователь не найден' })
          return
        }
        if (apiErr.status === 400) {
          setState({ key: requestKey, slug: null, error: 'Нельзя открыть диалог с этим пользователем' })
          return
        }
        if (apiErr.status === 401) {
          setState({ key: requestKey, slug: null, error: 'Нужна авторизация' })
          return
        }
        setState({ key: requestKey, slug: null, error: 'Не удалось открыть личный чат' })
      })

    return () => {
      active = false
    }
  }, [requestKey, user, username])

  if (!user) {
    return (
      <div className="panel">
        <p>Чтобы писать в личные сообщения, войдите в аккаунт.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => onNavigate('/login')}>
            Войти
          </button>
          <button className="btn ghost" onClick={() => onNavigate('/register')}>
            Регистрация
          </button>
        </div>
      </div>
    )
  }

  const isCurrent = state.key === requestKey
  const loading = !isCurrent
  const error = isCurrent ? state.error : null
  const slug = isCurrent ? state.slug : null

  if (loading) {
    return (
      <div className="panel muted" aria-busy="true">
        Открываем диалог...
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel">
        <p>{error}</p>
        <div className="actions">
          <button className="btn ghost" onClick={() => onNavigate('/direct')}>
            К списку диалогов
          </button>
        </div>
      </div>
    )
  }

  if (!slug) {
    return (
      <div className="panel">
        <p>Диалог недоступен.</p>
      </div>
    )
  }

  return <ChatRoomPage slug={slug} user={user} onNavigate={onNavigate} />
}
