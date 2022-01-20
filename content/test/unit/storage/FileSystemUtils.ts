import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export class FileSystemUtils {
  static createTempDirectory(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'))
  }
}
