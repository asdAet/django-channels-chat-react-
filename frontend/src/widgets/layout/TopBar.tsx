import type { UserProfile } from '../../entities/user/types'
import { avatarFallback } from '../../shared/lib/format'
import { useDirectInbox } from '../../shared/directInbox'
import { usePresence } from '../../shared/presence'

type Props = {
  user: UserProfile | null
  onNavigate: (path: string) => void
  onLogout: () => void
}
/**
 * Рендерит компонент `TopBar` и связанную разметку.
 * @param props Входной параметр `props`.
 * @returns Результат выполнения `TopBar`.
 */

export function TopBar({ user, onNavigate }: Props) {
  const { unreadDialogsCount } = useDirectInbox()
  const { online: presenceOnline, status: presenceStatus } = usePresence()
  const isCurrentUserOnline =
    Boolean(user) &&
    presenceStatus === 'online' &&
    presenceOnline.some((entry) => entry.username === user?.username)

  return (
    <header className="topbar">
      <button className="brand" onClick={() => onNavigate('/')}>
        EchoChat
      </button>
      <nav>
        <button className="link" onClick={() => onNavigate('/rooms/public')}>
          Публичный чат
        </button>
        {user && (
          <button className="link link-with-badge" onClick={() => onNavigate('/direct')}>
            <span>Личные чаты</span>
            {unreadDialogsCount > 0 && <span className="badge">{unreadDialogsCount}</span>}
          </button>
        )}
        {user && (
          <button className="link" onClick={() => onNavigate(`/users/${encodeURIComponent(user.username)}`)}>
            Профиль
          </button>
        )}
      </nav>
      <div className="nav-actions">
        {user ? (
          <button
            className="avatar_link"
            aria-label="Открыть профиль"
            onClick={() => onNavigate(`/users/${encodeURIComponent(user.username)}`)}
          >
            <div className={`avatar tiny${isCurrentUserOnline ? ' is-online' : ''}`}>
              {user.profileImage ? (
                <img src={user.profileImage} alt={user.username} decoding="async" />
              ) : (
                <span>{avatarFallback(user.username)}</span>
              )}
            </div>
          </button>
        ) : (
          <>
            <button className="link" onClick={() => onNavigate('/login')}>
              Войти
            </button>
            <button className="link" onClick={() => onNavigate('/register')}>
              Регистрация
            </button>
          </>
        )}
      </div>
    </header>
  )
}
