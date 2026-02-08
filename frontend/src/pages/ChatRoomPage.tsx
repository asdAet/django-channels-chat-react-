import { useEffect, useRef, useState } from 'react'
import { getRoomDetails, getRoomMessages } from '../shared/api/chat'
import type { Message } from '../entities/message/types'
import type { RoomDetails } from '../entities/room/types'
import type { UserProfile } from '../entities/user/types'
import { avatarFallback, formatTimestamp } from '../shared/lib/format'
import { debugLog } from '../shared/lib/debug'

type Props = {
  slug: string
  user: UserProfile | null
  onNavigate: (path: string) => void
}

export function ChatRoomPage({ slug, user, onNavigate }: Props) {
  const [details, setDetails] = useState<RoomDetails | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'online' | 'closed'>('idle')
  const [loading, setLoading] = useState(true)
  const [roomError, setRoomError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    queueMicrotask(() => setLoading(true))
    queueMicrotask(() => setStatus('connecting'))
    Promise.all([getRoomDetails(slug), getRoomMessages(slug)])
      .then(([info, payload]) => {
        if (!active) return
        setDetails(info)
        setMessages(payload.messages)
        setRoomError(null)
      })
      .catch((err) => {
        if (!active) return
        debugLog('Room load failed', err)
        setRoomError('Не удалось загрузить комнату')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [slug, user])

  useEffect(() => {
    if (!user) return
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${scheme}://${window.location.host}/ws/chat/${encodeURIComponent(slug)}/`)
    socketRef.current = socket
    socket.onopen = () => setStatus('online')
    socket.onclose = () => setStatus('closed')
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.message) {
          setMessages((prev) => [
            ...prev,
            {
              id: Number(new Date()),
              username: data.username,
              content: data.message,
              profilePic: data.profile_pic || null,
              createdAt: new Date().toISOString(),
            },
          ])
        }
      } catch (error) {
        debugLog('WS payload parse failed', error)
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [slug, user?.username])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = () => {
    if (!user) return
    if (!draft.trim()) return
    if (!socketRef.current || status === 'closed') {
      setRoomError('Нет соединения с сервером')
      return
    }

    socketRef.current.send(
      JSON.stringify({
        message: draft.trim(),
        username: user.username,
        profile_pic: user.profileImage,
        room: slug,
      }),
    )
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

  return (
    <div className="chat">
      <div className="chat-header">
        <div>
          <p className="eyebrow">Комната</p>
          <h2>{details?.createdBy || details?.name || slug}</h2>
          {details?.createdBy && <p className="muted">Создатель: {details.createdBy}</p>}
        </div>
        <span className={`pill ${status === 'online' ? 'success' : 'muted'}`}>
          {status === 'online' ? 'WebSocket online' : 'Соединение...'}
        </span>
      </div>

      {roomError && <div className="toast danger">{roomError}</div>}
      {loading ? (
        <div className="panel muted">Загружаем историю...</div>
      ) : (
        <div className="chat-box">
          <div className="chat-log" ref={listRef}>
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
              placeholder="Сообщение"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  sendMessage()
                }
              }}
            />
            <button className="btn primary" onClick={sendMessage} disabled={!draft.trim()}>
              Отправить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
