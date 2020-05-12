import { ContentFileHash } from '@katalyst/content/service/Hashing';
import { Repository } from '@katalyst/content/storage/Repository';
import { DeploymentId } from './DeploymentsRepository';

export class ContentFilesRepository {

    constructor(private readonly db: Repository) { }

    async getContentFiles(deploymentIds: DeploymentId[]): Promise<Map<DeploymentId, Map<string, ContentFileHash>>> {
        const queryResult = await this.db.any('SELECT deployment, name, content_hash FROM content_files WHERE deployment IN ($1:list)', [deploymentIds])
        const result: Map<DeploymentId, Map<string, ContentFileHash>> = new Map()
        queryResult.forEach(row => {
            if (!result.has(row.deployment)) {
                result.set(row.deployment, new Map())
            }
            result.get(row.deployment)!!.set(row.name, row.content_hash)
        })
        return result
    }

    async saveContentFiles(deploymentId: DeploymentId, content: Map<string, ContentFileHash>): Promise<void> {
        await this.db.txIf(transaction => {
            const contentPromises = Array.from(content.entries())
                .map(([name, hash]) => transaction.none('INSERT INTO content_files (deployment, name, content_hash) VALUES ($1, $2, $3)', [deploymentId, name, hash]))
            return transaction.batch(contentPromises)
        })
    }

}