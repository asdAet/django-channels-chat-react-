import type { UserProfile } from '../entities/user/types'
import { DirectChatByUsernamePage } from './DirectChatByUsernamePage'
import { DirectChatsList } from './DirectChatsPage'

type Props = {
  user: UserProfile | null
  username?: string
  onNavigate: (path: string) => void
}

export function DirectLayout({ user, username, onNavigate }: Props) {
  const hasActive = Boolean(username)

  return (
    <div className={`direct-layout${hasActive ? ' direct-layout--chat' : ''}`}>
      <aside className="direct-sidebar">
        <DirectChatsList
          user={user}
          onNavigate={onNavigate}
          activeUsername={username}
          resetActiveOnMount={!hasActive}
          className="direct-sidebar-card"
        />
      </aside>
      <section className="direct-main">
        {hasActive && username ? (
          <DirectChatByUsernamePage
            key={username}
            user={user}
            username={username}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="panel muted">Выберите диалог слева, чтобы открыть чат.</div>
        )}
      </section>
    </div>
  )
}