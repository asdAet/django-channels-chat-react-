import type { UserProfile } from '../entities/user/types'
import { Panel } from '../shared/ui'
import styles from '../styles/pages/DirectLayout.module.css'
import { DirectChatByUsernamePage } from './DirectChatByUsernamePage'
import { DirectChatsList } from './DirectChatsPage'

type Props = {
  user: UserProfile | null
  username?: string
  onNavigate: (path: string) => void
}

/**
 * Двухколоночный layout личных сообщений (список диалогов + чат).
 * @param props Входные данные пользователя и маршрутизации.
 * @returns JSX-разметка layout для direct-чатов.
 */
export function DirectLayout({ user, username, onNavigate }: Props) {
  const hasActive = Boolean(username)

  return (
    <div className={[styles.directLayout, hasActive ? styles.chatMode : ''].filter(Boolean).join(' ')}>
      <aside className={styles.sidebar}>
        <DirectChatsList
          user={user}
          onNavigate={onNavigate}
          activeUsername={username}
          resetActiveOnMount={!hasActive}
          className={styles.sidebarCard}
        />
      </aside>
      <section className={styles.main}>
        {hasActive && username ? (
          <DirectChatByUsernamePage
            key={username}
            user={user}
            username={username}
            onNavigate={onNavigate}
          />
        ) : (
          <Panel muted>Выберите диалог слева, чтобы открыть чат.</Panel>
        )}
      </section>
    </div>
  )
}

