import runner, { RunnerOption } from 'node-pg-migrate'
import { ClientConfig, MigrationDirection } from 'node-pg-migrate/dist/types'
import { join } from 'path'

export class MigrationManager {
  private readonly options: RunnerOption

  constructor(databaseConfig: ClientConfig) {
    const migrationsFolder = join(__dirname, 'scripts')

    this.options = {
      migrationsTable: 'migrations',
      dir: migrationsFolder,
      direction: 'up' as MigrationDirection,
      createSchema: true,
      createMigrationsSchema: true,
      count: Infinity,
      ignorePattern: '.*.ts',
      databaseUrl: databaseConfig
    }
  }

  async run(): Promise<void> {
    await runner(this.options)
  }
}
