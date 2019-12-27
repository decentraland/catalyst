import rarities from '../data/rarities.json'
import { RarityId } from './types'

/**
 * Obtain a wearable supply from its rarity
 * It'll use the JSON stored on /data/rarities.json
 */
export function getWearableSupplyByRarity(rarity?: RarityId): number {
  return rarity ? rarities[rarity] : 0
}
