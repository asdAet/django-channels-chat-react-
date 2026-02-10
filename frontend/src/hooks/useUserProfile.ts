import { useEffect, useMemo, useState } from 'react'

import { apiService } from '../adapters/ApiService'
import type { UserProfile } from '../entities/user/types'
import { debugLog } from '../shared/lib/debug'

type InternalState = {
  username: string | null
  user: UserProfile | null
  error: string | null
}

export type UserProfileState = {
  user: UserProfile | null
  loading: boolean
  error: string | null
}

export const useUserProfile = (username: string) => {
  const [state, setState] = useState<InternalState>({
    username: null,
    user: null,
    error: null,
  })

  const hasUsername = Boolean(username)

  useEffect(() => {
    if (!hasUsername) return

    let active = true

    apiService
      .getUserProfile(username)
      .then((payload) => {
        if (!active) return
        const user = payload.user
        setState({
          username,
          user: {
            username: user.username,
            email: user.email || '',
            profileImage: user.profileImage || null,
            bio: user.bio || '',
          },
          error: null,
        })
      })
      .catch((err) => {
        debugLog('User profile fetch failed', err)
        if (!active) return
        setState({ username, user: null, error: 'not_found' })
      })

    return () => {
      active = false
    }
  }, [hasUsername, username])

  return useMemo<UserProfileState>(() => {
    if (!hasUsername) {
      return { user: null, loading: false, error: 'not_found' }
    }

    const isStale = state.username !== username
    const user = isStale ? null : state.user
    const error = isStale ? null : state.error
    const loading = isStale || (!user && !error)

    return { user, loading, error }
  }, [hasUsername, state.error, state.user, state.username, username])
}
