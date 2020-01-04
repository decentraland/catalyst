import { ContentStorage } from "../storage/ContentStorage";
import { BlacklistTarget, parseBlacklistTargetString } from "./BlacklistTarget";
import { BlacklistMetadata } from "./Blacklist";

export class BlacklistStorage {

    private static BLACKLIST_CATEGORY: string = "blacklist"
    private static HISTORY_FILE_ID: string = "history.log"

    constructor(private readonly storage: ContentStorage) { }

    addBlacklist(target: BlacklistTarget, metadata: BlacklistMetadata) {
        return this.storage.store(BlacklistStorage.BLACKLIST_CATEGORY, target.asString(), Buffer.from(JSON.stringify(metadata)))
    }

    async areTargetsBlacklisted(targets: BlacklistTarget[]): Promise<Map<BlacklistTarget, boolean>> {
        const allTargetsAsId: string[] = await this.storage.listIds(BlacklistStorage.BLACKLIST_CATEGORY)
        return new Map(targets.map(target => [target, allTargetsAsId.includes(target.asString())]))
    }

    async removeBlacklist(target: BlacklistTarget) {
        try {
            await this.storage.delete(BlacklistStorage.BLACKLIST_CATEGORY, target.asString())
        } catch (error) {
            console.log(`Failed to delete blacklist`, target)
        }
    }

    async getAllBlacklists(): Promise<Map<BlacklistTarget, BlacklistMetadata>> {
        // List all targets
        const allTargetsAsId = await this.storage.listIds(BlacklistStorage.BLACKLIST_CATEGORY)

        // Read each blacklist metadata
        const blacklists: Promise<[string, BlacklistMetadata | undefined]>[] = allTargetsAsId.map(targetAsId => this.retrieveMetadata(targetAsId).then(metadata => [targetAsId, metadata]))

        // Remove undefined metadata and parse targets
        const entries: [BlacklistTarget, BlacklistMetadata][] = (await Promise.all(blacklists))
            .filter((tuple): tuple is [string, BlacklistMetadata] => !!tuple[0])
            .map(([targetAsId, metadata]) => [parseBlacklistTargetString(targetAsId), metadata])

        // Return as map
        return new Map(entries)
    }

    addBlacklistToHistory(target: BlacklistTarget, metadata: BlacklistMetadata): Promise<void> {
        const event = this.buildEvent(target, metadata, BlacklistAction.ADDITION)
        return this.appendEvent(event)
    }

    addBlacklistRemovalToHistory(target: BlacklistTarget, metadata: BlacklistMetadata): Promise<void> {
        const event = this.buildEvent(target, metadata, BlacklistAction.REMOVAL)
        return this.appendEvent(event)
    }

    private async retrieveMetadata(targetAsId: string): Promise<BlacklistMetadata | undefined> {
        try {
            const metadataBuffer = await this.storage.getContent(BlacklistStorage.BLACKLIST_CATEGORY, targetAsId);
            return JSON.parse(metadataBuffer.toString())
        } catch (error) {
            return undefined
        }
    }

    private appendEvent(event: BlacklistEvent): Promise<void> {
        return this.storage.store(BlacklistStorage.BLACKLIST_CATEGORY,
            BlacklistStorage.HISTORY_FILE_ID,
            Buffer.from(JSON.stringify(event)),
            true)
    }

    private buildEvent(target: BlacklistTarget, metadata: BlacklistMetadata, action: BlacklistAction): BlacklistEvent {
        return {
            target,
            metadata,
            action,
        }
    }

}

type BlacklistEvent = {
    target: BlacklistTarget,
    metadata: BlacklistMetadata,
    action: BlacklistAction
}

enum BlacklistAction {
    ADDITION = "addition",
    REMOVAL = "removal",
}