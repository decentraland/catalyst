import { Database } from '../../repository/Database'

export class ContentFilesRepository {
  constructor(private readonly db: Database) { }

  findContentHashesNotBeingUsedAnymore(lastGarbageCollectionTimestamp: number): Promise<string[]> {
    return this.db.map(
      `
            SELECT content_files.content_hash
            FROM content_files
            INNER JOIN deployments ON content_files.deployment=id
            LEFT JOIN deployments AS dd ON deployments.deleter_deployment=dd.id
            WHERE dd.local_timestamp IS NULL OR dd.local_timestamp > to_timestamp($1 / 1000.0)
            GROUP BY content_files.content_hash
            HAVING bool_or(deployments.deleter_deployment IS NULL) = FALSE
            `,
      [lastGarbageCollectionTimestamp],
      (row) => row.content_hash
    )
  }
}
