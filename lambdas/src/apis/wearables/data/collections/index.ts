import { Collection } from '../../services/types'

const halloween2019 = require('./halloween_2019/index.json')
const xmas2019 = require('./xmas_2019/index.json')
const exclusiveMasks = require('./exclusive_masks/index.json')
const baseAvatars = require('./base-avatars/index.json')

export const collections = {
  'base-avatars': baseAvatars as Collection,
  halloween_2019: halloween2019 as Collection,
  xmas_2019: xmas2019 as Collection,
  exclusive_masks: exclusiveMasks as Collection
}
