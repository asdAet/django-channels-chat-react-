import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { apiService } from '../../adapters/ApiService'
import { useReconnectingWebSocket } from '../../hooks/useReconnectingWebSocket'
import type { UserProfile } from '../../entities/user/types'
import type { OnlineUser } from '../api/users'
import { debugLog } from '../lib/debug'
import { getWebSocketBase } from '../lib/ws'
import { PresenceContext } from './context'

const PRESENCE_PING_MS = 10000

type ProviderProps = {
  user: UserProfile | null
  ready?: boolean
  children: ReactNode
}

export function PresenceProvider({ user, children, ready = true }: ProviderProps) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [guestCount, setGuestCount] = useState(0)
  const [guestSessionReady, setGuestSessionReady] = useState<boolean>(Boolean(user))

  useEffect(() => {
    let active = true
    if (!ready) {
      setGuestSessionReady(false)
      return () => {
        active = false
      }
    }

    if (user) {
      setGuestSessionReady(true)
      return () => {
        active = false
      }
    }

    setGuestSessionReady(false)
    apiService
      .ensurePresenceSession()
      .then(() => {
        if (!active) return
        setGuestSessionReady(true)
      })
      .catch((err) => {
        debugLog('Presence guest bootstrap failed', err)
        if (!active) return
        setGuestSessionReady(false)
      })

    return () => {
      active = false
    }
  }, [ready, user])

  const presenceUrl = useMemo(() => {
    if (!ready) return null
    if (!user && !guestSessionReady) return null
    const base = `${getWebSocketBase()}/ws/presence/`
    return `${base}?auth=${user ? '1' : '0'}`
  }, [guestSessionReady, ready, user])

  const handlePresence = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (Array.isArray(data?.online)) {
          const incoming = data.online
          if (user) {
            const nextImage = user.profileImage || null
            setOnlineUsers(
              incoming.map((entry: OnlineUser) =>
                entry.username === user.username ? { ...entry, profileImage: nextImage } : entry,
              ),
            )
          } else {
            setOnlineUsers(incoming)
          }
        }

        const rawGuests = data?.guests
        const parsedGuests =
          typeof rawGuests === 'number' ? rawGuests : Number.isFinite(Number(rawGuests)) ? Number(rawGuests) : null
        if (parsedGuests !== null) {
          setGuestCount(parsedGuests)
        }
      } catch (err) {
        debugLog('Presence WS parse failed', err)
      }
    },
    [user],
  )

  useEffect(() => {
    if (!ready) {
      setOnlineUsers([])
      setGuestCount(0)
    }
  }, [ready])

  useEffect(() => {
    if (!user) return
    setOnlineUsers((prev) => {
      let changed = false
      const updated = prev.map((entry) => {
        if (entry.username !== user.username) return entry
        const nextImage = user.profileImage || null
        if (entry.profileImage === nextImage) return entry
        changed = true
        return { ...entry, profileImage: nextImage }
      })
      return changed ? updated : prev
    })
  }, [user])

  const { status, lastError, send } = useReconnectingWebSocket({
    url: presenceUrl,
    onMessage: handlePresence,
    onError: (err) => debugLog('Presence WS error', err),
  })

  useEffect(() => {
    if (status !== 'online') return
    const sendPing = () => {
      send(JSON.stringify({ type: 'ping', ts: Date.now() }))
    }

    sendPing()
    const id = window.setInterval(sendPing, PRESENCE_PING_MS)
    return () => window.clearInterval(id)
  }, [send, status])

  const value = useMemo(
    () => ({
      online: user ? onlineUsers : [],
      guests: guestCount,
      status,
      lastError,
    }),
    [onlineUsers, guestCount, status, lastError, user],
  )

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}
