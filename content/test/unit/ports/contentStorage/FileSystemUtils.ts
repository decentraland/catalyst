import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export class FileSystemUtils {
  static createTempDirectory(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
  }

  static fileExists(...pathParts: string[]): boolean {
    return this.evaluateStatus(<boolean>false, (stats) => stats.isFile(), pathParts)
  }

  static evaluateStatus<T>(defaultValue: T, evaluator: (stats: fs.Stats) => T, pathParts: string[]): T {
    try {
      return evaluator(fs.lstatSync(pathParts.join('/')))
    } catch {
      return defaultValue
    }
  }
}
