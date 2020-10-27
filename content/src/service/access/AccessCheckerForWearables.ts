import log4js from "log4js"
import { Pointer, Fetcher } from "dcl-catalyst-commons";
import { EthAddress } from "dcl-crypto";
import { ContentAuthenticator } from "../auth/Authenticator";

export class AccessCheckerForWearables {

    constructor(
        private readonly authenticator: ContentAuthenticator,
        private readonly fetcher: Fetcher,
        private readonly dclCollectionsAccessUrl: string,
        private readonly LOGGER: log4js.Logger) { }

    public async checkAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        const errors: string[] = []

        if (pointers.length != 1) {
            errors.push(`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`)
        }

        const pointer: Pointer = pointers[0].toLocaleLowerCase()

        if (pointer.startsWith("default")) {
            if (!this.authenticator.isAddressOwnedByDecentraland(ethAddress)) {
                errors.push(`Only Decentraland can add or modify default wearables`)
            }
        } else {
            const pointerParts: string[] = pointer.split('-')
            if (pointerParts.length === 2) {
                if (pointerParts[0] && pointerParts[0]!==null && pointerParts[1] && pointerParts[1]!==null) {
                    const collection: string = pointerParts[0]
                    const itemId: number = parseInt(pointerParts[1], 10)

                    // Check that the address has access
                    const hasAccess = await this.checkCollectionAccess(collection, itemId, ethAddress)
                    if (!hasAccess) {
                        errors.push(`The provided Eth Address does not have access to the following wearable: (${collection}-${itemId})`)
                    }
                } else {
                    errors.push(`Wearable pointers must contain the collection id and the item id separated by a hyphen, for example (0xd148b172f8f64b7a42854447fbc528f41aa2258e-0). Invalid pointer: (${pointer})`)
                }
            } else {
                errors.push(`Wearable pointers should only contain the collection id and the item id separated by a hyphen, for example (0xd148b172f8f64b7a42854447fbc528f41aa2258e-0). Invalid pointer: (${pointer})`)
            }
        }
        return errors
    }

    private async checkCollectionAccess(collection: string, itemId: number, ethAddress: EthAddress): Promise<boolean> {
        try {
            const ethAddressLowercase = ethAddress.toLocaleLowerCase()
            const permissions: WearableItemPermissionsData = await this.getCollectionItems(collection, itemId, ethAddressLowercase)
            return (permissions.collectionCreator && permissions.collectionCreator === ethAddressLowercase)
                || (permissions.collectionManagers && permissions.collectionManagers.includes(ethAddressLowercase))
                || (permissions.itemManagers && permissions.itemManagers.includes(ethAddressLowercase))
        } catch (error) {
            this.LOGGER.error(`Error checking wearable access (${collection}, ${itemId}, ${ethAddress}).`, error)
            return false
        }
    }

    private async getCollectionItems(collection: string, itemId: number, ethAddress: EthAddress): Promise<WearableItemPermissionsData> {
        const query = `
         query getCollectionRoles($collection: String!, $itemId: Int!) {
            collections(where:{id: $collection}) {
              creator
              managers
              minters
            }
            items(where:{collection: $collection, blockchainId: $itemId}) {
              managers
              minters
            }
        }`

        try {
            const wearableCollectionsAndItems = await this.fetcher.queryGraph<WearableCollectionsAndItems>(
                this.dclCollectionsAccessUrl,
                query,
                { collection: collection, itemId: itemId})
            return {
                collectionCreator : wearableCollectionsAndItems.collections[0]?.creator,
                collectionManagers: wearableCollectionsAndItems.collections[0]?.managers,
                itemManagers      : wearableCollectionsAndItems.items[0]?.managers
            }
        } catch (error) {
            this.LOGGER.error(`Error fetching wearable: (${collection}-${itemId})`, error)
            throw error
        }
    }
}

type WearableItemPermissionsData = {
    collectionCreator: string,
    collectionManagers: string[],
    itemManagers: string[]
}

type WearableCollectionsAndItems = {
    collections: WearableCollection[],
    items: WearableCollectionItem[]
}

type WearableCollection = {
    creator: string,
    managers: string[],
    minters: string[]
}

type WearableCollectionItem = {
    managers: string[],
    minters: string[]
}
