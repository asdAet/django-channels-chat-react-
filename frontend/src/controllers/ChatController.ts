import { apiService } from '../adapters/ApiService'
import type { RoomDetailsDto, RoomMessagesDto, RoomMessagesParams } from '../dto/chat'

class ChatController {
  public async getPublicRoom(): Promise<RoomDetailsDto> {
    return await apiService.getPublicRoom()
  }

  public async getRoomDetails(slug: string): Promise<RoomDetailsDto> {
    return await apiService.getRoomDetails(slug)
  }

  public async getRoomMessages(slug: string, params?: RoomMessagesParams): Promise<RoomMessagesDto> {
    return await apiService.getRoomMessages(slug, params)
  }
}

export const chatController = new ChatController()

