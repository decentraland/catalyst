import { Request, Response } from 'express'
import { SmartContentServerFetcher } from '../../../SmartContentServerFetcher'
import { Entity, EntityContentItemReference } from 'dcl-catalyst-commons';

export async function getStandardErc721(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
    // Method: GET
    // Path: /standard/erc721/:contract/:option/:emission
    const { contract, option } = req.params;
    const emission : string | undefined = req.params.emission;

    try {
        const entities:Entity[] = await fetcher.fetchJsonFromContentServer(`/entities/wearable?pointer=${contract}-${option}`)
        if (entities && entities.length > 0 && entities[0].metadata) {
            const wearableMetadata: WearableMetadata = entities[0].metadata
            const id = `dcl://${contract}/${option}`
            const name = wearableMetadata.name
            const totalEmission = RARITIES_EMISSIONS[wearableMetadata.rarity]
            const description =  emission ? `DCL Wearable ${emission}/${totalEmission}` : ''
            const image = createContentUrl(fetcher, entities[0], wearableMetadata.image)
            const thumbnail = createContentUrl(fetcher, entities[0], wearableMetadata.thumbnail)
            const standardErc721 = {
                id,
                name,
                description,
                language: "en-US",
                image,
                thumbnail
            }
            res.send(standardErc721)
        } else {
            res.status(404).send()
        }
    } catch(e) {
        res.status(500).send(e.messsge);
    }
}

function createContentUrl(fetcher: SmartContentServerFetcher, entity: Entity, fileName: string | undefined): string | undefined {
    if (fileName) {
        const imageHash = entity.content?.find(item => item.file===fileName)?.hash
        if (imageHash) {
            return fetcher.getExternalContentServerUrl() + '/contents/' + imageHash
        }
    }
    return undefined
}

const RARITIES_EMISSIONS = {
    "common"   : 100000,
    "uncommon" : 10000,
    "rare"     : 5000,
    "epic"     : 1000,
    "legendary": 100,
    "mythic"   : 10,
    "unique"   : 1
}

type WearableMetadata = {
    name: string
    rarity: string
    image?: string
    thumbnail?: string
}
