import type { AxiosInstance } from 'axios'

import type { DirectChatsResponse } from '../../domain/interfaces/IApiService'

export const getDirectChats = async (apiClient: AxiosInstance): Promise<DirectChatsResponse> => {
  const { data } = await apiClient.get('/chat/direct/chats/')
  return data as DirectChatsResponse
}
