import { useEffect } from 'react'

import type { UserProfile } from '../entities/user/types'
import { avatarFallback, formatTimestamp } from '../shared/lib/format'
import { useDirectInbox } from '../shared/directInbox'

type Props = {
  user: UserProfile | null
  onNavigate: (path: string) => void
}

type ListProps = Props & {
  activeUsername?: string
  resetActiveOnMount?: boolean
  className?: string
}

export function DirectChatsList({
  user,
  onNavigate,
  activeUsername,
  resetActiveOnMount = true,
  className,
}: ListProps) {
  const { items, loading, error, setActiveRoom, refresh, unreadCounts } = useDirectInbox()

  useEffect(() => {
    if (!resetActiveOnMount) return
    setActiveRoom(null)
  }, [resetActiveOnMount, setActiveRoom])

  useEffect(() => {
    if (!user) return
    void refresh()
  }, [refresh, user])

  if (!user) {
    return (
      <div className="panel">
        <p>Чтобы пользоваться личными чатами, войдите в аккаунт.</p>
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

  const sectionClass = ['card', 'direct-inbox', className].filter(Boolean).join(' ')

  return (
    <section className={sectionClass}>
      <div className="card-header">
        <div>
          <p className="eyebrow">Личные чаты</p>
          <h2>Диалоги</h2>
        </div>
      </div>

      {loading && <p className="muted">Загрузка диалогов...</p>}
      {error && <div className="toast danger">{error}</div>}

      {!loading && !error && !items.length && (
        <p className="muted">Пока нет личных сообщений</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="direct-chat-list">
          {items.map((item) => {
            const isActive = Boolean(activeUsername && item.peer.username === activeUsername)
            return (
              <button
                key={item.slug}
                className={`direct-chat-item${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(`/direct/@${encodeURIComponent(item.peer.username)}`)}
              >
                <div className="avatar tiny">
                  {item.peer.profileImage ? (
                    <img src={item.peer.profileImage} alt={item.peer.username} loading="lazy" decoding="async" />
                  ) : (
                    <span>{avatarFallback(item.peer.username)}</span>
                  )}
                </div>
                <div className="direct-chat-item__body">
                  <div className="direct-chat-item__head">
                    <strong>{item.peer.username}</strong>
                    <div className="direct-chat-item__meta">
                      <span className="muted">{formatTimestamp(item.lastMessageAt)}</span>
                      {unreadCounts[item.slug] > 0 && (
                        <span className="badge direct-chat-badge">{unreadCounts[item.slug]}</span>
                      )}
                    </div>
                  </div>
                  <p>{item.lastMessage}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function DirectChatsPage({ user, onNavigate }: Props) {
  return <DirectChatsList user={user} onNavigate={onNavigate} />
}
