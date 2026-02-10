import type { AxiosInstance } from 'axios'

import type { UpdateProfileInput } from '../../domain/interfaces/IApiService'
import type { UserProfile } from '../../entities/user/types'

export async function updateProfile(
  apiClient: AxiosInstance,
  fields: UpdateProfileInput,
): Promise<{ user: UserProfile }> {
  const form = new FormData()
  form.append('username', fields.username)
  form.append('email', fields.email)
  if (fields.image) {
    form.append('image', fields.image)
  }

  if (fields.bio !== undefined) {
    form.append('bio', fields.bio)
  }

  const response = await apiClient.post<{ user: UserProfile }>('/auth/profile/', form)
  return response.data
}
