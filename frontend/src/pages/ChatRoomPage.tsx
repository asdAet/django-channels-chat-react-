import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UserProfile } from '../entities/user/types'
import { avatarFallback, formatTimestamp } from '../shared/lib/format'
import { debugLog } from '../shared/lib/debug'
import { useChatRoom } from '../hooks/useChatRoom'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useReconnectingWebSocket } from '../hooks/useReconnectingWebSocket'
import { sanitizeText } from '../shared/lib/sanitize'
import { getWebSocketBase } from '../shared/lib/ws'

type Props = {
  slug: string
  user: UserProfile | null
  onNavigate: (path: string) => void
}

const MAX_MESSAGE_LENGTH = 1000
const RATE_LIMIT_COOLDOWN_MS = 10_000

export function ChatRoomPage({ slug, user, onNavigate }: Props) {
  const { details, messages, loading, loadingMore, hasMore, error, loadMore, setMessages } =
    useChatRoom(slug, user)
  const isPublicRoom = slug === 'public'
  const isOnline = useOnlineStatus()
  const [draft, setDraft] = useState('')
  const [roomError, setRoomError] = useState<string | null>(null)
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const listRef = useRef<HTMLDivElement | null>(null)
  const isAtBottomRef = useRef(true)
  const prependingRef = useRef(false)
  const prevScrollHeightRef = useRef(0)
  const tempIdRef = useRef(0)

  const wsUrl = useMemo(() => {
    if (!user && !isPublicRoom) return null
    return `${getWebSocketBase()}/ws/chat/${encodeURIComponent(slug)}/`
  }, [slug, user, isPublicRoom])

  const applyRateLimit = useCallback((cooldownMs: number) => {
    const until = Date.now() + cooldownMs
    setRateLimitUntil((prev) => (prev && prev > until ? prev : until))
    setNow(Date.now())
  }, [])

  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      if (data?.error === 'rate_limited') {
        const retryAfter = Number(data.retry_after ?? data.retryAfter ?? data.retry ?? NaN)
        const cooldownMs = Number.isFinite(retryAfter)
          ? Math.max(1, retryAfter) * 1000
          : RATE_LIMIT_COOLDOWN_MS
        applyRateLimit(cooldownMs)
        return
      }
      if (data?.error === 'message_too_long') {
        setRoomError(`Сообщение слишком длинное (макс ${MAX_MESSAGE_LENGTH} символов)`)
        return
      }
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
    onError: () => setRoomError('Ошибка соединения'),
  })

  useEffect(() => {
    if (!rateLimitUntil) return
    const id = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= rateLimitUntil) {
        window.clearInterval(id)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [rateLimitUntil])

  const handleScroll = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const { scrollTop, scrollHeight, clientHeight } = list
    const nearBottom = scrollHeight - scrollTop - clientHeight < 80
    isAtBottomRef.current = nearBottom

    if (scrollTop < 120 && hasMore && !loadingMore && !loading) {
      prependingRef.current = true
      prevScrollHeightRef.current = scrollHeight
      loadMore()
    }
  }, [hasMore, loadingMore, loading, loadMore])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    if (prependingRef.current) {
      const delta = list.scrollHeight - prevScrollHeightRef.current
      list.scrollTop = list.scrollTop + delta
      prependingRef.current = false
      return
    }
    if (isAtBottomRef.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages])

  const rateLimitRemainingMs = rateLimitUntil ? Math.max(0, rateLimitUntil - now) : 0
  const rateLimitActive = rateLimitRemainingMs > 0
  const rateLimitSeconds = Math.ceil(rateLimitRemainingMs / 1000)

  const sendMessage = () => {
    if (!user) {
      setRoomError('Авторизуйтесь, чтобы отправлять сообщения')
      return
    }
    const raw = draft
    if (!raw.trim()) return
    if (rateLimitActive) {
      setRoomError(`Слишком часто. Подождите ${rateLimitSeconds} сек.`)
      return
    }
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

  if (!user && !isPublicRoom) {
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
        return 'Соединение потеряно'
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
          {rateLimitActive && (
            <div className="rate-limit-banner" role="status" aria-live="polite">
              Слишком много сообщений. Подождите{' '}
              <span className="rate-limit-timer">{rateLimitSeconds} сек</span>
            </div>
          )}
          <div className="chat-log" ref={listRef} aria-live="polite" onScroll={handleScroll}>
            {loadingMore && (
              <div className="panel muted" aria-busy="true">
                Загружаем ранние сообщения...
              </div>
            )}
            {!hasMore && (
              <div className="panel muted" aria-live="polite">
                Это начало истории.
              </div>
            )}
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
          {!user && isPublicRoom && (
            <div className="auth-callout">
              <div>
                <p className="auth-callout-title">Только чтение</p>
                <p className="muted">
                  Чтобы писать в публичном чате, войдите или зарегистрируйтесь.
                </p>
              </div>
              <div className="actions">
                <button className="btn primary" onClick={() => onNavigate('/login')}>
                  Войти
                </button>
                <button className="btn ghost" onClick={() => onNavigate('/register')}>
                  Регистрация
                </button>
              </div>
            </div>
          )}
          {user && (
            <div className={`chat-input${rateLimitActive ? ' blocked' : ''}`}>
              <input
                type="text"
                value={draft}
                aria-label="Сообщение"
                placeholder="Сообщение"
                disabled={rateLimitActive}
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
                disabled={!draft.trim() || status !== 'online' || !isOnline || rateLimitActive}
              >
                Отправить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
