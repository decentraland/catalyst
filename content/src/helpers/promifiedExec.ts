import { exec } from 'child_process'
import { promisify } from 'util'

export function getPromifiedExec(): Promise<typeof exec> {
  return promisify(exec)
}
