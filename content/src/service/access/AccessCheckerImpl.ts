import { ILoggerComponent } from '@well-known-components/interfaces'
import { EntityType, Fetcher } from 'dcl-catalyst-commons'
import { ContentAuthenticator } from '../auth/Authenticator'
import { AccessChecker, AccessParams } from './AccessChecker'
import { AccessCheckerForProfiles } from './AccessCheckerForProfiles'
import { AccessCheckerForScenes } from './AccessCheckerForScenes'
import { AccessCheckerForWearables } from './AccessCheckerForWearables'

export class AccessCheckerImpl implements AccessChecker {
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
    blocksL2SubgraphUrl,
    logs
  }: AccessCheckerImplParams) {
    const logger = logs.getLogger('AccessCheckerImpl')

    this.accessCheckerForScenes = new AccessCheckerForScenes(authenticator, fetcher, landManagerSubgraphUrl, logger)
    this.accessCheckerForProfiles = new AccessCheckerForProfiles(authenticator)
    this.accessCheckerForWearables = new AccessCheckerForWearables(
      fetcher,
      collectionsL1SubgraphUrl,
      collectionsL2SubgraphUrl,
      blocksL1SubgraphUrl,
      blocksL2SubgraphUrl,
      logger
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
      case EntityType.STORE:
        return this.accessCheckerForProfiles.checkAccess(params)
      default:
        return ['Unknown type provided']
    }
  }
}

export type AccessCheckerImplParams = {
  authenticator: ContentAuthenticator
  fetcher: Fetcher
  logs: ILoggerComponent
  landManagerSubgraphUrl: string
  collectionsL1SubgraphUrl: string
  collectionsL2SubgraphUrl: string
  blocksL1SubgraphUrl: string
  blocksL2SubgraphUrl: string
}
