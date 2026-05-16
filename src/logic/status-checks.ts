import { IStatusCapableComponent } from '../types'

type StatusResponse = { successful: boolean; details: Record<string, any> }

export function isStatusCapableComponent(component: any): component is IStatusCapableComponent {
  if (component && typeof component === 'object' && typeof component['getComponentStatus'] == 'function') {
    return true
  }

  return false
}

/**
 * This function generates a status checks map out of a bag of components.
 */
export async function statusResponseFromComponents(components: Record<string, any>): Promise<StatusResponse> {
  const response: StatusResponse = {
    successful: true,
    details: {}
  }

  // get the status from all components asynchronously
  const statuses = await Promise.allSettled(
    Object.values(components)
      .filter(isStatusCapableComponent)
      .map((component) => component.getComponentStatus())
  )

  // create the map of statuses
  for (const status of statuses) {
    if (status.status == 'fulfilled') {
      const { name, data } = await status.value!
      response.details[name] = data
    } else {
      response.successful = false
    }
  }

  return response
}
