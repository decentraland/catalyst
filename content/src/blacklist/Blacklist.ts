import { Timestamp } from "../service/Service";
import { BlacklistTarget } from "./BlacklistTarget";
import { EthAddress, Signature, Authenticator } from "../service/auth/Authenticator";
import { BlacklistStorage } from "./BlacklistStorage";

export class Blacklist {

    constructor(private readonly storage: BlacklistStorage) { }

    async addTarget(target: BlacklistTarget, metadata: BlacklistMetadata) {
        // TODO: Validate that blocker can blacklist

        // Validate that signature belongs to the blocker
        await this.validateBlocker(metadata);

        // Add blacklist
        await this.storage.addBlacklist(target, metadata)

        // Add to history
        await this.storage.addBlacklistToHistory(target, metadata)
    }

    async removeTarget(target: BlacklistTarget, metadata: BlacklistMetadata) {
        // TODO: Validate that blocker can remove from blacklist

        // Validate that signature belongs to the blocker
        await this.validateBlocker(metadata);

        // Remove blacklist
        await this.storage.removeBlacklist(target)

        // Add to history
        await this.storage.addBlacklistRemovalToHistory(target, metadata)
    }

    getAllBlacklistedTargets(): Promise<Map<BlacklistTarget, BlacklistMetadata>> {
        return this.storage.getAllBlacklists()
    }

    async isTargetBlacklisted(target: BlacklistTarget): Promise<boolean> {
        const map = await this.areTargetsBlacklisted([target])
        return map.get(target) ?? false;
    }

    areTargetsBlacklisted(targets: BlacklistTarget[]): Promise<Map<BlacklistTarget, boolean>> {
        return this.storage.areTargetsBlacklisted(targets)
    }

    private async validateBlocker(metadata: BlacklistMetadata) {
        if (!await Authenticator.validateSignature(this.buildMessageToSign(metadata), metadata.blocker, metadata.signature)) {
            throw new Error(`Failed to authenticate the blocker. Please sign your address and timestamp`);
        }
    }

    private buildMessageToSign(metadata: BlacklistMetadata) {
        return `${metadata.blocker}${metadata.timestamp}`
    }

}

export type BlacklistMetadata = {
    blocker: EthAddress,
    timestamp: Timestamp,
    signature: Signature
}


