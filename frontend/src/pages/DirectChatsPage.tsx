import { useEffect, useMemo } from 'react'

import type { UserProfile } from '../entities/user/types'
import { formatTimestamp } from '../shared/lib/format'
import { useDirectInbox } from '../shared/directInbox'
import { usePresence } from '../shared/presence'
import { Avatar, Button, Card, Panel, Toast } from '../shared/ui'
import styles from '../styles/pages/DirectChatsPage.module.css'

type Props = {
  user: UserProfile | null
  onNavigate: (path: string) => void
}

type ListProps = Props & {
  activeUsername?: string
  resetActiveOnMount?: boolean
  className?: string
}

/**
 * Список direct-диалогов пользователя.
 * @param props Входные параметры состояния и навигации.
 * @returns JSX-блок списка direct-чатов.
 */
export function DirectChatsList({
  user,
  onNavigate,
  activeUsername,
  resetActiveOnMount = true,
  className,
}: ListProps) {
  const { items, loading, error, setActiveRoom, refresh, unreadCounts } = useDirectInbox()
  const { online: presenceOnline, status: presenceStatus } = usePresence()
  const onlineUsernames = useMemo(
    () =>
      new Set(
        presenceStatus === 'online' ? presenceOnline.map((entry) => entry.username) : [],
      ),
    [presenceOnline, presenceStatus],
  )

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
      <Panel>
        <p>Чтобы пользоваться личными чатами, войдите в аккаунт.</p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => onNavigate('/login')}>
            Войти
          </Button>
          <Button variant="ghost" onClick={() => onNavigate('/register')}>
            Регистрация
          </Button>
        </div>
      </Panel>
    )
  }

  return (
    <Card as="section" className={[styles.directInbox, className].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Личные чаты</p>
          <h2 className={styles.title}>Диалоги</h2>
        </div>
      </div>

      {loading && <p className={styles.muted}>Загрузка диалогов...</p>}
      {error && <Toast variant="danger">{error}</Toast>}

      {!loading && !error && !items.length && <p className={styles.muted}>Пока нет личных сообщений</p>}

      {!loading && !error && items.length > 0 && (
        <div className={styles.directChatList}>
          {items.map((item) => {
            const isActive = Boolean(activeUsername && item.peer.username === activeUsername)
            const isPeerOnline = onlineUsernames.has(item.peer.username)
            return (
              <button
                key={item.slug}
                className={[styles.directChatItem, isActive ? styles.active : ''].filter(Boolean).join(' ')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onNavigate(`/direct/@${encodeURIComponent(item.peer.username)}`)}
                type="button"
              >
                <Avatar
                  username={item.peer.username}
                  profileImage={item.peer.profileImage}
                  size="tiny"
                  online={isPeerOnline}
                />
                <div className={styles.itemBody}>
                  <div className={styles.itemHead}>
                    <strong className={styles.itemName} title={item.peer.username}>
                      {item.peer.username}
                    </strong>
                    <div className={styles.itemMeta}>
                      <span className={styles.time}>{formatTimestamp(item.lastMessageAt)}</span>
                      {unreadCounts[item.slug] > 0 && (
                        <span className={styles.badge}>{unreadCounts[item.slug]}</span>
                      )}
                    </div>
                  </div>
                  <p className={styles.preview}>{item.lastMessage}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/**
 * Страница списка direct-диалогов.
 * @param props Входные параметры пользователя и навигации.
 * @returns JSX-страница direct-инбокса.
 */
export function DirectChatsPage({ user, onNavigate }: Props) {
  return <DirectChatsList user={user} onNavigate={onNavigate} />
}

