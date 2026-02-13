import type { AxiosInstance } from 'axios'

import type { DirectStartResponse } from '../../domain/interfaces/IApiService'

export const startDirectChat = async (apiClient: AxiosInstance, username: string): Promise<DirectStartResponse> => {
  const { data } = await apiClient.post('/chat/direct/start/', { username })
  return data as DirectStartResponse
}
