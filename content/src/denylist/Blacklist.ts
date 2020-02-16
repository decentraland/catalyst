import { Timestamp } from "../service/time/TimeSorting";
import { DenylistTarget } from "./DenylistTarget";
import { DenylistStorage } from "./DenylistStorage";
import { ContentCluster } from "../service/synchronization/ContentCluster";
import { EthAddress, Signature } from "dcl-crypto";
import { ContentAuthenticator } from "../service/auth/Authenticator";
import { httpProviderForNetwork } from '../../../contracts/utils';

export class Denylist {

    constructor(private readonly storage: DenylistStorage,
        private readonly authenticator: ContentAuthenticator,
        private readonly cluster: ContentCluster,
        private readonly network: string) { }

    async addTarget(target: DenylistTarget, metadata: DenylistMetadata) {
        // Validate that blocker can denylist
        this.validateBlocker(metadata)

        // Validate that signature belongs to the blocker
        await this.validateSignature(target, metadata);

        // Add denylist
        await this.storage.addDenylist(target, metadata)

        // Add to history
        await this.storage.addDenylistToHistory(target, metadata)
    }

    async removeTarget(target: DenylistTarget, metadata: DenylistMetadata) {
        // Validate that blocker can remove from denylist
        this.validateBlocker(metadata)

        // Validate that signature belongs to the blocker
        await this.validateSignature(target, metadata);

        // Remove denylist
        await this.storage.removeDenylist(target)

        // Add to history
        await this.storage.addDenylistRemovalToHistory(target, metadata)
    }

    getAllDenylistedTargets(): Promise<Map<DenylistTarget, DenylistMetadata>> {
        return this.storage.getAllDenylists()
    }

    async isTargetDenylisted(target: DenylistTarget): Promise<boolean> {
        const map = await this.areTargetsDenylisted([target])
        return map.get(target) ?? false;
    }

    areTargetsDenylisted(targets: DenylistTarget[]): Promise<Map<DenylistTarget, boolean>> {
        return this.storage.areTargetsDenylisted(targets)
    }

    private validateBlocker(metadata: DenylistMetadata) {
        // Check if address belongs to Decentraland
        const nodeOwner: EthAddress | undefined = this.cluster.getOwnIdentity()?.owner
        const isBlockerTheNodeOwner: boolean = !!nodeOwner && nodeOwner === metadata.blocker
        if (!isBlockerTheNodeOwner && !this.authenticator.isAddressOwnedByDecentraland(metadata.blocker)) {
            throw new Error("Expected the denylister to be either Decentraland, or the node's owner")
        }
    }

    private async validateSignature(target: DenylistTarget, metadata: DenylistMetadata) {
        const messageToSign = this.buildMessageToSign(target, metadata)
        const authChain = ContentAuthenticator.createSimpleAuthChain(messageToSign, metadata.blocker, metadata.signature)
        if (!await this.authenticator.validateSignature(messageToSign, authChain, httpProviderForNetwork(this.network), Date.now())) {
            throw new Error(`Failed to authenticate the blocker. Please sign the target and timestamp`);
        }
    }

    private buildMessageToSign(target: DenylistTarget, metadata: DenylistMetadata) {
        return `${target.asString()}${metadata.timestamp}`
    }

}

export type DenylistMetadata = {
    blocker: EthAddress,
    timestamp: Timestamp,
    signature: Signature
}


