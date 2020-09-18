import { Request, Response } from 'express'
import { SmartContentServerFetcher } from '../../../SmartContentServerFetcher'
import { Entity } from 'dcl-catalyst-commons';

export async function getStandardErc721(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
    // Method: GET
    // Path: /standard/erc721/:contract/:option/:emission
    const { contract, option, emission } = req.params;

    try {
        const entities:Entity[] = await fetcher.fetchJsonFromContentServer(`/entities/wearable?pointer=${contract}-${option}`)
        if (entities && entities.length > 0 && entities[0].metadata) {
            const wearableMetadata: WearableMetadata = entities[0].metadata
            const id = `dcl://${contract}/${option}`
            const name = wearableMetadata.name
            const totalEmission = RARITIES_EMISSIONS[wearableMetadata.rarity]
            const description =  emission ? `DCL Wearable ${emission}/${totalEmission}` : ''
            const image = fetcher.getExternalContentServerUrl() + '/contents/' + wearableMetadata.image
            const thumbnail = fetcher.getExternalContentServerUrl() + '/contents/' + wearableMetadata.thumbnail
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
    image: string
    thumbnail: string
}
