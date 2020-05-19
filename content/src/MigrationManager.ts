import { join } from "path"
import runner from "node-pg-migrate";
import { MigrationDirection, RunnerOption, ClientConfig } from "node-pg-migrate/dist/types";

export class MigrationManager {

    private readonly options: RunnerOption

    constructor(databaseConfig: ClientConfig) {
        const migrationsFolder = join(__dirname, 'migrations')

        this.options = {
            migrationsTable: 'migrations',
            dir: migrationsFolder,
            direction: 'up' as MigrationDirection,
            createSchema: true,
            createMigrationsSchema: true,
            count: Infinity,
            ignorePattern: '.*\.ts',
            databaseUrl: databaseConfig,
        }
    }

    async run(): Promise<void> {
        await runner(this.options);
    }
}