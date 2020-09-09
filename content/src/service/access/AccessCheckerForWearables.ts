import log4js from "log4js"
import { Pointer, Fetcher } from "dcl-catalyst-commons";
import { EthAddress } from "dcl-crypto";
import { ContentAuthenticator } from "../auth/Authenticator";

export class AccessCheckerForWearables {

    constructor(
        private readonly authenticator: ContentAuthenticator,
        private readonly fetcher: Fetcher,
        private readonly dclParcelAccessUrl: string,
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
                const collection: string = pointerParts[0]
                const itemId: number = parseInt(pointerParts[1], 10)

                // Check that the address has access
                const hasAccess = await this.checkCollectionAccess(collection, itemId, ethAddress)
                if (!hasAccess) {
                    errors.push(`The provided Eth Address does not have access to the following wearable: (${collection}-${itemId})`)
                }
            } else {
                errors.push(`Wearable pointers should only contain the collection id and the item id separated by a hyphen, for example (0xd148b172f8f64b7a42854447fbc528f41aa2258e-0). Invalid pointer: ${pointer}`)
            }
        }

        return errors
    }

    private async checkCollectionAccess(collection: string, itemId: number, ethAddress: EthAddress): Promise<boolean> {
        const collectionItems: WerableCollectionItems = await this.getCollectionItems(collection, itemId, ethAddress)
        return collectionItems.collections[0]?.creator === ethAddress
            || collectionItems.collections[0]?.managers.includes(ethAddress)
            || collectionItems.items[0]?.managers.includes(ethAddress)
    }

    private async getCollectionItems(collection: string, itemId: number, ethAddress: EthAddress): Promise<WerableCollectionItems> {
        const query = `
         query getCollectionRoles($collection: String) {
            collections(where:{id: $collection}) {
              minters
              managers
              creator
            }
            items(where:{collection: $collection, itemId: $itemId}) {
              itemId
              minters
              managers
            }
        }`

        const variables = {
            collection: collection,
            itemId: itemId
        }

        try {
            return await this.fetcher.queryGraph<WerableCollectionItems>(this.dclParcelAccessUrl, query, variables)
        } catch (error) {
            this.LOGGER.error(`Error fetching wearable: (${collection}-${itemId})`, error)
            throw error
        }

    }

}

type WerableCollectionItems = {
    collections: WearableCollection[],
    items: WearableCollectionItem
}

type WearableCollection = {
    creator: string,
    managers: string[],
    minters: string[]
}

type WearableCollectionItem = {
    itemId: string,
    managers: string[],
    minters: string[]
}
