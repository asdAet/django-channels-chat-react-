import type { AxiosInstance } from 'axios'

import type { Message } from '../../entities/message/types'

export async function getRoomMessages(
  apiClient: AxiosInstance,
  slug: string,
  params?: { limit?: number; beforeId?: number },
): Promise<{ messages: Message[] }> {
  const encodedSlug = encodeURIComponent(slug)
  const query = new URLSearchParams()
  if (params?.limit) {
    query.set('limit', String(params.limit))
  }
  if (params?.beforeId) {
    query.set('before', String(params.beforeId))
  }
  const suffix = query.toString()
  const url = `/chat/rooms/${encodedSlug}/messages/${suffix ? `?${suffix}` : ''}`
  const response = await apiClient.get<{ messages: Message[] }>(
    url,
  )
  return response.data
}
