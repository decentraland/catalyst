import { AppComponents } from '../types'
import { Configuration } from './configuration'

// Example 1
export function createMyComponent1(components: Pick<AppComponents, 'logs' | 'configuration'>) {
  // sync operation always defined, compiler helps you see the fields available
  const storageFolder = components.configuration.STORAGE_ROOT_FOLDER
  console.log(storageFolder)
  return 1
}

// Example 2 - more specific, better for testing! only the configuration fields needed are mocked
// Compiler helps you! STORAGE_ROOT_FOLDER is typed
type MyComponentConfig = Pick<Configuration, 'STORAGE_ROOT_FOLDER'>

// Compiler blames you! Does not compile
// type MyComponentConfig = Pick<Configuration, 'NON_EXISTEN_KEY'>

export function createMyComponent2(
  components: Pick<AppComponents, 'logs'> & { configuration: Pick<Configuration, 'STORAGE_ROOT_FOLDER'> }
) {
  // sync operation always defined, compiler helps you see the fields available
  const storageFolder = components.configuration.STORAGE_ROOT_FOLDER
  console.log(storageFolder)
  return 1
}
