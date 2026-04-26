import { DatabaseClient } from '../../ports/postgres'

export interface IActiveEntitiesRepository {
  /**
   * Set the active deployment row for each pointer to the given entityId,
   * creating the row if absent and updating it if present.
   */
  updateActiveDeployments(db: DatabaseClient, pointers: string[], entityId: string): Promise<void>
  /**
   * Remove the active deployment rows for the given pointers.
   */
  removeActiveDeployments(db: DatabaseClient, pointers: string[]): Promise<void>
}
