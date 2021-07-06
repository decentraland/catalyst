import { EntityType, Fetcher } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import { ContentAuthenticator } from '../auth/Authenticator'
import { AccessChecker, AccessParams } from './AccessChecker'
import { AccessCheckerForProfiles } from './AccessCheckerForProfiles'
import { AccessCheckerForScenes } from './AccessCheckerForScenes'
import { AccessCheckerForWearables } from './AccessCheckerForWearables'

export class AccessCheckerImpl implements AccessChecker {
  private static readonly LOGGER = log4js.getLogger('AccessCheckerImpl')

  private readonly accessCheckerForScenes: AccessCheckerForScenes
  private readonly accessCheckerForProfiles: AccessCheckerForProfiles
  private readonly accessCheckerForWearables: AccessCheckerForWearables

  constructor({
    authenticator,
    fetcher,
    landManagerSubgraphUrl,
    collectionsL1SubgraphUrl,
    collectionsL2SubgraphUrl,
    blocksL1SubgraphUrl,
    blocksL2SubgraphUrl
  }: AccessCheckerImplParams) {
    this.accessCheckerForScenes = new AccessCheckerForScenes(
      authenticator,
      fetcher,
      landManagerSubgraphUrl,
      AccessCheckerImpl.LOGGER
    )
    this.accessCheckerForProfiles = new AccessCheckerForProfiles(authenticator)
    this.accessCheckerForWearables = new AccessCheckerForWearables(
      fetcher,
      collectionsL1SubgraphUrl,
      collectionsL2SubgraphUrl,
      blocksL1SubgraphUrl,
      blocksL2SubgraphUrl,
      AccessCheckerImpl.LOGGER
    )
  }

  async hasAccess(params: AccessParams): Promise<string[]> {
    switch (params.type) {
      case EntityType.SCENE:
        return this.accessCheckerForScenes.checkAccess(params)
      case EntityType.PROFILE:
        return this.accessCheckerForProfiles.checkAccess(params)
      case EntityType.WEARABLE:
        return this.accessCheckerForWearables.checkAccess(params)
      default:
        return ['Unknown type provided']
    }
  }
}

export type AccessCheckerImplParams = {
  authenticator: ContentAuthenticator
  fetcher: Fetcher
  landManagerSubgraphUrl: string
  collectionsL1SubgraphUrl: string
  collectionsL2SubgraphUrl: string
  blocksL1SubgraphUrl: string
  blocksL2SubgraphUrl: string
}
