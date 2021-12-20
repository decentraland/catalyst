import { EntityVersion, Timestamp } from 'src/types'

type ComponentStatus = Record<string, any>
interface ComponentsStatuses {
  [x: string]: ComponentStatus
}

interface ContentServerStatus {
  name: string
  version: EntityVersion
  currentTime: Timestamp
  lastImmutableTime: Timestamp
}

export type Status = ContentServerStatus | ComponentsStatuses

export interface StatusCapableComponent {
  getComponentStatus(): Promise<Record<string, any>>
  getStatusName(): string
}

export interface IStatusComponent {
  getStatus(): Promise<Status>
}

export function createStatusComponent(statusCapableComponents: StatusCapableComponent[]): IStatusComponent {
  const getStatus = async (): Promise<Status> => {
    const response: Status = {}

    for (const component of statusCapableComponents) {
      response[component.getStatusName()] = await component.getComponentStatus()
    }

    return response
  }

  return {
    getStatus
  }
}
