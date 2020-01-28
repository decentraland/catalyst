import { Timestamp } from "../service/time/TimeSorting";
import { BlacklistTarget } from "./BlacklistTarget";
import { EthAddress, Signature, Authenticator } from "../service/auth/Authenticator";
import { BlacklistStorage } from "./BlacklistStorage";
import { ContentCluster } from "../service/synchronization/ContentCluster";

export class Blacklist {

    constructor(private readonly storage: BlacklistStorage,
        private readonly authenticator: Authenticator,
        private readonly cluster: ContentCluster) { }

    async addTarget(target: BlacklistTarget, metadata: BlacklistMetadata) {
        // Validate that blocker can blacklist
        this.validateBlocker(metadata)

        // Validate that signature belongs to the blocker
        await this.validateSignature(target, metadata);

        // Add blacklist
        await this.storage.addBlacklist(target, metadata)

        // Add to history
        await this.storage.addBlacklistToHistory(target, metadata)
    }

    async removeTarget(target: BlacklistTarget, metadata: BlacklistMetadata) {
        // Validate that blocker can remove from blacklist
        this.validateBlocker(metadata)

        // Validate that signature belongs to the blocker
        await this.validateSignature(target, metadata);

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

    private validateBlocker(metadata: BlacklistMetadata) {
        // Check if address belongs to Decentraland
        const nodeOwner: EthAddress | undefined = this.cluster.getOwnIdentity()?.owner
        const isBlockerTheNodeOwner: boolean = !!nodeOwner && nodeOwner === metadata.blocker
        if (!isBlockerTheNodeOwner && !this.authenticator.isAddressOwnedByDecentraland(metadata.blocker)) {
            throw new Error("Expected the blacklister to be either Decentraland, or the node's owner")
        }
    }

    private async validateSignature(target: BlacklistTarget, metadata: BlacklistMetadata) {
        const messageToSign = this.buildMessageToSign(target, metadata)
        const authChain = Authenticator.createSimpleAuthChain(messageToSign, metadata.blocker, metadata.signature)
        if (!await this.authenticator.validateSignature(messageToSign, authChain)) {
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


