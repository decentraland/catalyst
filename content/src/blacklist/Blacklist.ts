import { Timestamp } from "../service/time/TimeSorting";
import { BlacklistTarget } from "./BlacklistTarget";
import { EthAddress, Signature, Authenticator } from "../service/auth/Authenticator";
import { BlacklistStorage } from "./BlacklistStorage";

export class Blacklist {

    constructor(private readonly storage: BlacklistStorage) { }

    async addTarget(target: BlacklistTarget, metadata: BlacklistMetadata) {
        // TODO: Validate that blocker can blacklist

        // Validate that signature belongs to the blocker
        await this.validateBlocker(target, metadata);

        // Add blacklist
        await this.storage.addBlacklist(target, metadata)

        // Add to history
        await this.storage.addBlacklistToHistory(target, metadata)
    }

    async removeTarget(target: BlacklistTarget, metadata: BlacklistMetadata) {
        // TODO: Validate that blocker can remove from blacklist

        // Validate that signature belongs to the blocker
        await this.validateBlocker(target, metadata);

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

    private async validateBlocker(target: BlacklistTarget, metadata: BlacklistMetadata) {
        const messageToSign = this.buildMessageToSign(target, metadata)
        const authChain = Authenticator.createSimpleAuthChain(messageToSign, metadata.blocker, metadata.signature)
        if (!await Authenticator.validateSignature(messageToSign, authChain)) {
            throw new Error(`Failed to authenticate the blocker. Please sign the target and timestamp`);
        }
    }

    private buildMessageToSign(target: BlacklistTarget, metadata: BlacklistMetadata) {
        return `${target.asString()}${metadata.timestamp}`
    }

}

export type BlacklistMetadata = {
    blocker: EthAddress,
    timestamp: Timestamp,
    signature: Signature
}


