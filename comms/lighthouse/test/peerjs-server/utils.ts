import { IdType } from '../../src/peerjs-server/enums'
import { Client, IClient } from '../../src/peerjs-server/models/client'

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
export function createClient({
  id = 'id',
  token = '',
  msg = '',
  idType = IdType.SELF_ASSIGNED
}: { id?: string; token?: string; msg?: string; idType?: IdType } = {}): IClient {
  const client = new Client({ id, token, idType, msg })
  client.setAuthenticated(true)
  return client
}
