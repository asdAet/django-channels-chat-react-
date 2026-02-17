import type { AxiosInstance } from 'axios'

export async function ensurePresenceSession(apiClient: AxiosInstance): Promise<{ ok: boolean }> {
  const response = await apiClient.get<{ ok: boolean }>('/auth/presence-session/')
  return response.data
}

