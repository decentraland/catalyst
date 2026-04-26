import { CatalystServerInfo } from '@dcl/catalyst-contracts'

export interface DAOComponent {
  getAllContentServers(): Promise<CatalystServerInfo[]>
  getAllServers(): Promise<CatalystServerInfo[]>
}
