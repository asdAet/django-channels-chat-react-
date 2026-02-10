import type { AxiosInstance } from 'axios'

import type { UserProfile } from '../../entities/user/types'

export async function getUserProfile(
  apiClient: AxiosInstance,
  username: string,
): Promise<{ user: UserProfile }> {
  const safe = encodeURIComponent(username)
  const response = await apiClient.get<{ user: UserProfile }>(`/auth/users/${safe}/`)
  return response.data
}
