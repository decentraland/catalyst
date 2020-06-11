import { ContentFileHash } from '@katalyst/content/service/Hashing';
import { Repository } from '@katalyst/content/storage/Repository';
import { DeploymentId } from './DeploymentsRepository';
import { Timestamp } from '@katalyst/content/service/time/TimeSorting';

export class ContentFilesRepository {

    constructor(private readonly db: Repository) { }

    findContentHashesNotBeingUsedAnymore(lastGarbageCollection: Timestamp): Promise<ContentFileHash[]> {
        return this.db.map(`
            SELECT content_files.content_hash
            FROM content_files
            INNER JOIN deployments ON content_files.deployment=id
            LEFT  JOIN deployments AS dd ON deployments.deleter_deployment=dd.id
            WHERE dd.local_timestamp IS NULL OR dd.local_timestamp > to_timestamp($1 / 1000.0)
            GROUP BY content_files.content_hash
            HAVING bool_or(deployments.deleter_deployment IS NULL) = FALSE
            `, [ lastGarbageCollection ], row => row.content_hash)

    }

    async getContentFiles(deploymentIds: DeploymentId[]): Promise<Map<DeploymentId, Map<string, ContentFileHash>>> {
        if (deploymentIds.length === 0) {
            return new Map()
        }
        const queryResult = await this.db.any('SELECT deployment, key, content_hash FROM content_files WHERE deployment IN ($1:list)', [deploymentIds])
        const result: Map<DeploymentId, Map<string, ContentFileHash>> = new Map()
        queryResult.forEach(row => {
            if (!result.has(row.deployment)) {
                result.set(row.deployment, new Map())
            }
            result.get(row.deployment)!!.set(row.key, row.content_hash)
        })
        return result
    }

    async saveContentFiles(deploymentId: DeploymentId, content: Map<string, ContentFileHash>): Promise<void> {
        await this.db.txIf(transaction => {
            const contentPromises = Array.from(content.entries())
                .map(([name, hash]) => transaction.none('INSERT INTO content_files (deployment, key, content_hash) VALUES ($1, $2, $3)', [deploymentId, name, hash]))
            return transaction.batch(contentPromises)
        })
    }

}