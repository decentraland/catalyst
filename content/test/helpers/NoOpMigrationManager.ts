import { MigrationManager } from '../../src/migrations/MigrationManager'

export class NoOpMigrationManager extends MigrationManager {
  constructor() {
    super({})
  }

  // No nothing
  run(): Promise<void> {
    return Promise.resolve()
  }
}
