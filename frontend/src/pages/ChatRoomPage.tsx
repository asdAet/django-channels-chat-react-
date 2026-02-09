import { useEffect, useMemo, useRef, useState } from 'react'
import type { UserProfile } from '../entities/user/types'
import { avatarFallback, formatTimestamp } from '../shared/lib/format'
import { debugLog } from '../shared/lib/debug'
import { useChatRoom } from '../hooks/useChatRoom'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useReconnectingWebSocket } from '../hooks/useReconnectingWebSocket'
import { sanitizeText } from '../shared/lib/sanitize'

type Props = {
  slug: string
  user: UserProfile | null
  onNavigate: (path: string) => void
}

const MAX_MESSAGE_LENGTH = 1000

export function ChatRoomPage({ slug, user, onNavigate }: Props) {
  const { details, messages, loading, loadingMore, hasMore, error, loadMore, setMessages } =
    useChatRoom(slug, user)
  const isOnline = useOnlineStatus()
  const [draft, setDraft] = useState('')
  const [roomError, setRoomError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const tempIdRef = useRef(0)

  const wsUrl = useMemo(() => {
    if (!user) return null
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${scheme}://${window.location.host}/ws/chat/${encodeURIComponent(slug)}/`
  }, [slug, user])

  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      if (!data.message) return
      const content = sanitizeText(String(data.message), MAX_MESSAGE_LENGTH)
      if (!content) return
      tempIdRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() * 1000 + tempIdRef.current,
          username: data.username,
          content,
          profilePic: data.profile_pic || null,
          createdAt: new Date().toISOString(),
        },
      ])
    } catch (error) {
      debugLog('WS payload parse failed', error)
    }
  }

  const { status, lastError, send } = useReconnectingWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onOpen: () => setRoomError(null),
    onClose: (event) => {
      if (event.code !== 1000 && event.code !== 1001) {
        setRoomError('Соединение потеряно. Пытаемся восстановить...')
      }
    },
    onError: () => setRoomError('Ошибка соединения') ,
  })

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = () => {
    if (!user) return
    const raw = draft
    if (!raw.trim()) return
    if (raw.length > MAX_MESSAGE_LENGTH) {
      setRoomError(`Сообщение слишком длинное (макс ${MAX_MESSAGE_LENGTH} символов)`)
      return
    }
    if (!isOnline || status !== 'online') {
      setRoomError('Нет соединения с сервером')
      return
    }

    const cleaned = sanitizeText(raw, MAX_MESSAGE_LENGTH)
    const payload = JSON.stringify({
      message: cleaned,
      username: user.username,
      profile_pic: user.profileImage,
      room: slug,
    })

    if (!send(payload)) {
      setRoomError('Не удалось отправить сообщение')
      return
    }
    setDraft('')
  }

  if (!user) {
    return (
      <div className="panel">
        <p>Чтобы войти в комнату, авторизуйтесь.</p>
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

  const loadError = error ? 'Не удалось загрузить комнату' : null
  const visibleError = roomError || loadError

  const statusLabel = (() => {
    switch (status) {
      case 'online':
        return 'WebSocket online'
      case 'connecting':
        return 'Подключаемся...'
      case 'offline':
        return 'Офлайн'
      case 'error':
        return 'Ошибка соединения'
      case 'closed':
        return 'Соединение закрыто'
      default:
        return 'Соединение...'
    }
  })()

  const statusClass = status === 'online' ? 'success' : status === 'connecting' ? 'warning' : 'muted'

  return (
    <div className="chat">
      {!isOnline && (
        <div className="toast warning" role="status">
          Нет подключения к интернету. Мы восстановим соединение автоматически.
        </div>
      )}
      {lastError && status === 'error' && (
        <div className="toast danger" role="alert">
          Проблемы с соединением. Проверьте сеть и попробуйте еще раз.
        </div>
      )}
      <div className="chat-header">
        <div>
          <p className="eyebrow">Комната</p>
          <h2>{details?.createdBy || details?.name || slug}</h2>
          {details?.createdBy && <p className="muted">Создатель: {details.createdBy}</p>}
        </div>
        <span className={`pill ${statusClass}`} aria-live="polite">
          <span className="status-pill">
            {status === 'connecting' && <span className="spinner" aria-hidden="true" />}
            {statusLabel}
          </span>
        </span>
      </div>

      {visibleError && <div className="toast danger">{visibleError}</div>}
      {loading ? (
        <div className="panel muted" aria-busy="true">
          Загружаем историю...
        </div>
      ) : (
        <div className="chat-box">
          {hasMore && (
            <button
              className="btn outline"
              type="button"
              aria-label="Загрузить более ранние сообщения"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Загружаем сообщения...' : 'Показать ранние сообщения'}
            </button>
          )}
          <div className="chat-log" ref={listRef} aria-live="polite">
            {messages.map((msg) => (
              <article className="message" key={`${msg.id}-${msg.createdAt}`}>
                <div className="avatar small">
                  {msg.profilePic ? (
                    <img src={msg.profilePic} alt={msg.username} />
                  ) : (
                    <span>{avatarFallback(msg.username)}</span>
                  )}
                </div>
                <div className="message-body">
                  <div className="message-meta">
                    <strong>{msg.username}</strong>
                    <span className="muted">{formatTimestamp(msg.createdAt)}</span>
                  </div>
                  <p>{msg.content}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={draft}
              aria-label="Сообщение"
              placeholder="Сообщение"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  sendMessage()
                }
              }}
            />
            <button
              className="btn primary"
              aria-label="Отправить сообщение"
              onClick={sendMessage}
              disabled={!draft.trim() || status !== 'online' || !isOnline}
            >
              Отправить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
