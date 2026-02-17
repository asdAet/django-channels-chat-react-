import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'

import type { UserProfile } from '../entities/user/types'
import { useUserProfile } from '../hooks/useUserProfile'
import { usePresence } from '../shared/presence'
import { avatarFallback, formatLastSeen, formatRegistrationDate } from '../shared/lib/format'
import { Button, Card, Panel } from '../shared/ui'
import styles from '../styles/pages/UserProfilePage.module.css'

type Props = {
  user: UserProfile | null
  onLogout: () => void
  username: string
  currentUser: UserProfile | null
  onNavigate: (path: string) => void
}

/**
 * Публичная страница профиля пользователя.
 * @param props Данные маршрута, текущей сессии и обработчики действий.
 * @returns JSX-страница профиля пользователя.
 */
export function UserProfilePage({
  username,
  currentUser,
  onNavigate,
  onLogout,
}: Props) {
  const { user, loading, error } = useUserProfile(username)
  const { online: presenceOnline, status: presenceStatus } = usePresence()
  const isSelfRoute = currentUser?.username === username
  const profileUser = isSelfRoute ? currentUser : user

  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const contentRef = useRef<HTMLDivElement | null>(null)

  const hasProfileImage = Boolean(profileUser?.profileImage)
  const pinchState = useRef<{ distance: number; zoom: number } | null>(null)
  const dragState = useRef<{
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)

  const clampZoom = (value: number) => Math.min(15, Math.max(1, value))

  const clampPan = (nextX: number, nextY: number, zoomValue: number = zoom) => {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: nextX, y: nextY }
    }
    const currentZoom = zoom || 1
    const baseWidth = rect.width / currentZoom
    const baseHeight = rect.height / currentZoom
    const nextWidth = baseWidth * zoomValue
    const nextHeight = baseHeight * zoomValue
    const maxX = Math.max(0, (nextWidth - window.innerWidth) / 2)
    const maxY = Math.max(0, (nextHeight - window.innerHeight) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, nextX)),
      y: Math.min(maxY, Math.max(-maxY, nextY)),
    }
  }

  const applyZoomAtPoint = (
    clientX: number,
    clientY: number,
    nextZoom: number,
  ) => {
    const rect = contentRef.current?.getBoundingClientRect()
    setZoom((currentZoom) => {
      const clampedZoom = clampZoom(nextZoom)
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        if (clampedZoom <= 1) {
          setPan({ x: 0, y: 0 })
        }
        return clampedZoom
      }
      const offsetX = clientX - rect.left
      const offsetY = clientY - rect.top
      const dx = offsetX - rect.width / 2
      const dy = offsetY - rect.height / 2
      const scale = clampedZoom / currentZoom
      setPan((prev) => {
        const nextPan = {
          x: prev.x - dx * (scale - 1),
          y: prev.y - dy * (scale - 1),
        }
        return clampedZoom <= 1
          ? { x: 0, y: 0 }
          : clampPan(nextPan.x, nextPan.y, clampedZoom)
      })
      return clampedZoom
    })
  }

  const openPreview = () => {
    if (!hasProfileImage) return
    setZoom(1)
    setPan({ x: 0, y: 0 })
    pinchState.current = null
    dragState.current = null
    setIsPreviewOpen(true)
  }
  const closePreview = () => setIsPreviewOpen(false)

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.cancelable) {
      event.preventDefault()
    }
    const step = event.deltaY < 0 ? 0.2 : -0.2
    applyZoomAtPoint(event.clientX, event.clientY, zoom + step)
  }

  const getTouchDistance = (
    touches: ReactTouchEvent<HTMLDivElement>['touches'],
  ) => {
    if (touches.length < 2) return null
    const first = touches.item(0)
    const second = touches.item(1)
    if (!first || !second) return null
    const dx = first.clientX - second.clientX
    const dy = first.clientY - second.clientY
    return Math.hypot(dx, dy)
  }

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1 && zoom > 1) {
      const touch = event.touches.item(0)
      if (!touch) return
      dragState.current = {
        x: touch.clientX,
        y: touch.clientY,
        panX: pan.x,
        panY: pan.y,
      }
      return
    }

    const distance = getTouchDistance(event.touches)
    if (!distance) return
    pinchState.current = {
      distance,
      zoom,
    }
  }

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (dragState.current && event.touches.length === 1) {
      const touch = event.touches.item(0)
      if (!touch) return
      if (event.cancelable) {
        event.preventDefault()
      }
      const nextX = dragState.current.panX + (touch.clientX - dragState.current.x)
      const nextY = dragState.current.panY + (touch.clientY - dragState.current.y)
      setPan(clampPan(nextX, nextY))
      return
    }

    if (!pinchState.current) return
    const nextDistance = getTouchDistance(event.touches)
    if (!nextDistance) return
    if (event.cancelable) {
      event.preventDefault()
    }
    const first = event.touches.item(0)
    const second = event.touches.item(1)
    const scale = nextDistance / pinchState.current.distance
    const nextZoom = clampZoom(pinchState.current.zoom * scale)
    if (first && second) {
      const centerX = (first.clientX + second.clientX) / 2
      const centerY = (first.clientY + second.clientY) / 2
      applyZoomAtPoint(centerX, centerY, nextZoom)
    } else {
      setZoom(nextZoom)
      setPan((prev) =>
        nextZoom <= 1 ? { x: 0, y: 0 } : clampPan(prev.x, prev.y, nextZoom),
      )
    }
  }

  const handleTouchEnd = () => {
    pinchState.current = null
    dragState.current = null
  }

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return
    event.preventDefault()
    dragState.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }

  const handleMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    event.preventDefault()
    const nextX = dragState.current.panX + (event.clientX - dragState.current.x)
    const nextY = dragState.current.panY + (event.clientY - dragState.current.y)
    setPan(clampPan(nextX, nextY))
  }

  const handleMouseUp = () => {
    dragState.current = null
  }

  const handleAvatarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!hasProfileImage) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPreview()
    }
  }

  useEffect(() => {
    if (!isPreviewOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isPreviewOpen])

  if (loading && !profileUser) {
    return <Panel muted busy>Загрузка профиля...</Panel>
  }

  if (error || !profileUser) {
    return (
      <Panel>
        <p>Профиль не найден.</p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => onNavigate('/')}>
            На главную
          </Button>
        </div>
      </Panel>
    )
  }

  const isSelf = currentUser?.username === profileUser.username
  const isUserOnline =
    presenceStatus === 'online' &&
    presenceOnline.some((entry) => entry.username === profileUser.username)

  return (
    <Card wide>
      <div>
        <p className={styles.eyebrowProfile}>Профиль пользователя</p>
      </div>

      <div
        className={[styles.profileAvatarWrapper, isUserOnline ? styles.online : ''].filter(Boolean).join(' ')}
        data-online={isUserOnline ? 'true' : 'false'}
      >
        <div
          className={[styles.profileAvatar, styles.readonly, hasProfileImage ? styles.clickable : ''].filter(Boolean).join(' ')}
          role={hasProfileImage ? 'button' : undefined}
          tabIndex={hasProfileImage ? 0 : -1}
          aria-label={hasProfileImage ? 'Открыть аватар' : undefined}
          onClick={openPreview}
          onKeyDown={handleAvatarKeyDown}
        >
          {profileUser.profileImage ? (
            <img src={profileUser.profileImage} alt={profileUser.username} />
          ) : (
            <span>{avatarFallback(profileUser.username)}</span>
          )}
        </div>
      </div>

      {isPreviewOpen && profileUser.profileImage && (
        <div
          className={styles.avatarLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`Аватар ${profileUser.username}`}
          onClick={closePreview}
        >
          <div
            className={[styles.avatarLightboxContent, zoom > 1 ? styles.zoomed : ''].filter(Boolean).join(' ')}
            ref={contentRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
            onClick={(event) => event.stopPropagation()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <img
              className={styles.avatarLightboxImage}
              src={profileUser.profileImage}
              alt={`Аватар ${profileUser.username}`}
              draggable={false}
            />
          </div>
        </div>
      )}

      <div className={styles.stack}>
        <div>
          <h2>{profileUser.username}</h2>
          <p className={styles.muted}>О себе</p>
          <p className={styles.bioText}>{profileUser.bio || 'Пока ничего не указано.'}</p>

          {isUserOnline ? (
            <p className={[styles.profileMeta, styles.profileMetaRight].join(' ')}>В сети</p>
          ) : (
            <p className={[styles.profileMeta, styles.profileMetaRight].join(' ')}>
              Последний раз в сети: {formatLastSeen(profileUser.lastSeen) || '—'}
            </p>
          )}
          <p className={[styles.profileMeta, styles.profileMetaRight].join(' ')}>
            Зарегистрирован: {formatRegistrationDate(profileUser.registeredAt) || '—'}
          </p>
        </div>
        <div className={styles.actions}>
          {isSelf && (
            <Button variant="link" onClick={() => onNavigate('/profile')}>
              Редактировать
            </Button>
          )}
          {!isSelf && currentUser && (
            <Button
              variant="link"
              onClick={() => onNavigate(`/direct/@${encodeURIComponent(profileUser.username)}`)}
              data-testid="send-dm-button"
            >
              Отправить сообщение
            </Button>
          )}
          <Button variant="link" onClick={() => onNavigate('/')}>
            На главную
          </Button>
          {isSelf && (
            <Button variant="dangerLink" onClick={onLogout} data-testid="logout-button">
              Выйти
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
