import { ContentFileHash } from '@katalyst/content/service/Hashing';
import { Repository } from '@katalyst/content/storage/Repository';
import { DeploymentId } from './DeploymentsRepository';

export class ContentFilesRepository {

    constructor(private readonly db: Repository) { }

    findContentHashesNotBeingUsedAnymore(deploymentIds: DeploymentId[]): Promise<ContentFileHash[]> {
        if (deploymentIds.length === 0) {
            return Promise.resolve([])
        }
        return this.db.map(`
            SELECT content_hash
            FROM (
                SELECT content_hash, (deleter_deployment IS NULL) AS currently_used
                FROM content_files
                LEFT JOIN deployments ON deployments.id = content_files.deployment
                WHERE content_hash IN (
                    SELECT DISTINCT content_hash
                    FROM content_files
                    WHERE deployment IN ($1:list)
                )
            ) AS subquery
            GROUP BY content_hash
            HAVING bool_or(currently_used) = FALSE
            `, [ deploymentIds ], row => row.content_hash)

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