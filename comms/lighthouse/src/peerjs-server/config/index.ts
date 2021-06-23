import { IClient } from '../models/client'
import { IMessage } from '../models/message'
import { numericIdGenerator } from '../utils/idgenerator'

export interface IConfig {
  readonly port: number
  readonly expire_timeout: number
  readonly alive_timeout: number
  readonly key: string
  readonly path: string
  readonly concurrent_limit: number
  readonly proxied: boolean | string
  readonly cleanup_out_msgs: number
  readonly ssl?: {
    key: string
    cert: string
  }
  readonly authHandler: (client: IClient | undefined, message: IMessage) => Promise<boolean>
  readonly idGenerator: () => string
  readonly transmissionFilter: (src: string, dst: string, message: IMessage) => Promise<boolean>
  readonly maxIdIterations: number
}

const defaultConfig: IConfig = {
  port: 9000,
  expire_timeout: 5000,
  alive_timeout: 60000,
  key: 'peerjs',
  path: '/myapp',
  concurrent_limit: 5000,
  proxied: false,
  cleanup_out_msgs: 1000,
  ssl: {
    key: '',
    cert: ''
  },
  authHandler: () => Promise.resolve(true),
  idGenerator: numericIdGenerator(),
  maxIdIterations: 100000,
  transmissionFilter: () => Promise.resolve(true)
}

export default defaultConfig
