import { resolve } from 'path'

const INTEGRATION_RESOURCES_PATH = resolve(__dirname)

export function getIntegrationResourcePathFor(resourceFilename: string): string {
  return resolve(INTEGRATION_RESOURCES_PATH, resourceFilename)
}
