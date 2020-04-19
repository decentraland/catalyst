import { ContentStorage } from "../storage/ContentStorage";
import { DenylistTarget, parseDenylistTargetString } from "./DenylistTarget";
import { DenylistMetadata } from "./Denylist";

export class DenylistStorage {

    private static DENYLIST_CATEGORY: string = "denylist"
    private static HISTORY_FILE_ID: string = "history.log"

    constructor(private readonly storage: ContentStorage) { }

    addDenylist(target: DenylistTarget, metadata: DenylistMetadata) {
        return this.storage.store(DenylistStorage.DENYLIST_CATEGORY, target.asString(), Buffer.from(JSON.stringify(metadata)))
    }

    async areTargetsDenylisted(targets: DenylistTarget[]): Promise<Map<DenylistTarget, boolean>> {
        const allTargetsAsId: string[] = await this.readAllDenylists()
        return new Map(targets.map(target => [target, allTargetsAsId.includes(target.asString())]))
    }

    removeDenylist(target: DenylistTarget): Promise<void> {
        return this.storage.delete(DenylistStorage.DENYLIST_CATEGORY, target.asString())
    }

    async getAllDenylists(): Promise<Map<DenylistTarget, DenylistMetadata>> {
        // List all targets
        const allTargetsAsId: string[] = await this.readAllDenylists()

        // Read each denylist metadata
        const denylists = allTargetsAsId.map<Promise<[string, DenylistMetadata | undefined]>>(async targetAsId => [targetAsId, await this.retrieveMetadata(targetAsId)])

        // Remove undefined metadata and parse targets
        const entries: [DenylistTarget, DenylistMetadata][] = (await Promise.all(denylists))
            .filter((tuple): tuple is [string, DenylistMetadata] => !!tuple[0])
            .map(([targetAsId, metadata]) => [parseDenylistTargetString(targetAsId), metadata])

        // Return as map
        return new Map(entries)
    }

    addDenylistToHistory(target: DenylistTarget, metadata: DenylistMetadata): Promise<void> {
        const event = this.buildEvent(target, metadata, DenylistAction.ADDITION)
        return this.appendEvent(event)
    }

    addDenylistRemovalToHistory(target: DenylistTarget, metadata: DenylistMetadata): Promise<void> {
        const event = this.buildEvent(target, metadata, DenylistAction.REMOVAL)
        return this.appendEvent(event)
    }

    private async retrieveMetadata(targetAsId: string): Promise<DenylistMetadata | undefined> {
        const contentItem = await this.storage.getContent(DenylistStorage.DENYLIST_CATEGORY, targetAsId);
        if (contentItem) {
            return JSON.parse((await contentItem.asBuffer()).toString())
        } else {
            return undefined
        }
    }

    private appendEvent(event: DenylistEvent): Promise<void> {
        return this.storage.store(DenylistStorage.DENYLIST_CATEGORY,
            DenylistStorage.HISTORY_FILE_ID,
            Buffer.from(JSON.stringify(event)),
            true)
    }

    private async readAllDenylists(): Promise<string[]> {
        try {
            return (await this.storage.listIds(DenylistStorage.DENYLIST_CATEGORY))
                .filter(_ => _ !== DenylistStorage.HISTORY_FILE_ID);
        } catch (error) {
            return []
        }
    }

    private buildEvent(target: DenylistTarget, metadata: DenylistMetadata, action: DenylistAction): DenylistEvent {
        return {
            target: target.asString(),
            metadata,
            action,
        }
    }

}

type DenylistEvent = {
    target: string,
    metadata: DenylistMetadata,
    action: DenylistAction
}

enum DenylistAction {
    ADDITION = "addition",
    REMOVAL = "removal",
}
