import { ILoggerComponent } from '@well-known-components/interfaces'
import runner, { RunnerOption } from 'node-pg-migrate'
import { ClientConfig, MigrationDirection } from 'node-pg-migrate/dist/types'
import { join } from 'path'
import { AppComponents } from '../types'

export class MigrationManager {
  private readonly options: RunnerOption
  logs: ILoggerComponent.ILogger

  constructor(components: Pick<AppComponents, 'logs'>, databaseConfig: ClientConfig) {
    const migrationsFolder = join(__dirname, 'scripts')

    this.logs = components.logs.getLogger('MigrationManager')

    this.options = {
      migrationsTable: 'migrations',
      dir: migrationsFolder,
      direction: 'up' as MigrationDirection,
      createSchema: true,
      createMigrationsSchema: true,
      count: Infinity,
      databaseUrl: databaseConfig,
      log: () => {}
    }

    if (process.env.CI !== 'true' && process.env.RUNNING_TESTS !== 'true') {
      this.options.log = this.logs.log
      this.options.logger = this.logs
    }
  }

  async run(): Promise<void> {
    this.logs.debug('Running migrations')
    await runner(this.options)
  }
}
