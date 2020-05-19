import { MigrationManager } from "@katalyst/content/MigrationManager";

export class NoOpMigrationManager extends MigrationManager {

    constructor() {
        super({})
    }

    // No nothing
    run(): Promise<void> {
        return Promise.resolve()
    }
}