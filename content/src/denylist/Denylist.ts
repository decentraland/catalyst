import { Timestamp } from "../service/time/TimeSorting";
import { DenylistTarget, DenylistTargetType, DenylistTargetId } from "./DenylistTarget";
import { ContentCluster } from "../service/synchronization/ContentCluster";
import { EthAddress, AuthChain, Authenticator } from "dcl-crypto";
import { ContentAuthenticator } from "../service/auth/Authenticator";
import { httpProviderForNetwork } from '../../../contracts/utils';
import { Repository } from "../storage/Repository";
import { DenylistRepository } from "../storage/repositories/DenylistRepository";

export class Denylist {

    constructor(private readonly repository: Repository,
        private readonly authenticator: ContentAuthenticator,
        private readonly cluster: ContentCluster,
        private readonly network: string) { }

    static buildMessageToSign(target: DenylistTarget, timestamp: Timestamp) {
        return `${target.asString()}${timestamp}`
    }

    async addTarget(target: DenylistTarget, metadata: DenylistMetadata) {
        // Validate that blocker can denylist
        this.validateBlocker(metadata)

        // Validate that signature belongs to the blocker
        await this.validateSignature(target, metadata);

        await this.repository.tx(async transaction => {
            // Add denylist
            await transaction.denylist.addTarget(target)

            // Add to history
            await transaction.denylist.addEventToHistory(target, metadata, DenylistAction.ADDITION)
        })
    }

    async removeTarget(target: DenylistTarget, metadata: DenylistMetadata) {
        // Validate that blocker can remove from denylist
        this.validateBlocker(metadata)

        // Validate that signature belongs to the blocker
        await this.validateSignature(target, metadata);

        await this.repository.tx(async transaction => {
            // Remove denylist
            await transaction.denylist.removeTarget(target)

            // Add to history
            await transaction.denylist.addEventToHistory(target, metadata, DenylistAction.REMOVAL)
        })
    }

    getAllDenylistedTargets(): Promise<{ target: DenylistTarget, metadata: DenylistMetadata }[]> {
        return this.repository.denylist.getAllDenylistedTargets()
    }

    async isTargetDenylisted(target: DenylistTarget): Promise<boolean> {
        const map = await this.areTargetsDenylisted(this.repository.denylist, [target])
        return map.get(target.getType())?.get(target.getId()) ?? false;
    }

    async areTargetsDenylisted(denylistRepo: DenylistRepository, targets: DenylistTarget[]): Promise<Map<DenylistTargetType, Map<DenylistTargetId, boolean>>> {
        if (targets.length === 0) {
            return new Map()
        }

        // Get only denylisted
        const denylisted = await denylistRepo.getDenylistedTargets(targets);

        // Build result
        const result: Map<DenylistTargetType, Map<DenylistTargetId, boolean>> = new Map()
        targets.forEach(target => {
            const type = target.getType()
            const id = target.getId()
            const isDenylisted = denylisted.get(type)?.includes(id) ?? false
            if (!result.has(type)) {
                result.set(type, new Map())
            }
            result.get(type)!!.set(id, isDenylisted)
        })

        return result
    }

    private validateBlocker(metadata: DenylistMetadata) {
        // Check if address belongs to Decentraland
        const nodeOwner: EthAddress | undefined = this.cluster.getIdentityInDAO()?.owner
        const blocker: EthAddress = Authenticator.ownerAddress(metadata.authChain)
        const isBlockerTheNodeOwner: boolean = nodeOwner === blocker
        if (!isBlockerTheNodeOwner && !this.authenticator.isAddressOwnedByDecentraland(blocker)) {
            throw new Error("Expected the denylister to be either Decentraland, or the node's owner")
        }
    }

    private async validateSignature(target: DenylistTarget, metadata: DenylistMetadata) {
        const messageToSign = Denylist.buildMessageToSign(target, metadata.timestamp)
        const validationResult = await this.authenticator.validateSignature(messageToSign, metadata.authChain, httpProviderForNetwork(this.network), Date.now());
        if (!validationResult.ok) {
            throw new Error(`Failed to authenticate the blocker. Please sign the target and timestamp`);
        }
    }

}

export type DenylistMetadata = {
    timestamp: Timestamp,
    authChain: AuthChain,
}

export enum DenylistAction {
    ADDITION = "addition",
    REMOVAL = "removal",
}

