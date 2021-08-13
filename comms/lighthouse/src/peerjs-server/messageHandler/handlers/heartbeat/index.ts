import { IClient } from '../../../models/client'

export const HeartbeatHandler = async (client: IClient | undefined): Promise<boolean> => {
  if (client) {
    const nowTime = new Date().getTime()
    client.setLastPing(nowTime)
  }

  return true
}
