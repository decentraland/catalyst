import { EntityType, Fetcher, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { ContentAuthenticator } from '../auth/Authenticator'
import { AccessChecker } from './AccessChecker'
import { AccessCheckerForProfiles } from './AccessCheckerForProfiles'
import { AccessCheckerForScenes } from './AccessCheckerForScenes'
import { AccessCheckerForWearables } from './AccessCheckerForWearables'

export class AccessCheckerImpl implements AccessChecker {
  private static readonly LOGGER = log4js.getLogger('AccessCheckerImpl')

  private readonly accessCheckerForScenes: AccessCheckerForScenes
  private readonly accessCheckerForProfiles: AccessCheckerForProfiles
  private readonly accessCheckerForWearables: AccessCheckerForWearables

  constructor(
    authenticator: ContentAuthenticator,
    fetcher: Fetcher,
    dclParcelAccessUrl: string,
    dclCollectionsAccessUrl: string
  ) {
    this.accessCheckerForScenes = new AccessCheckerForScenes(
      authenticator,
      fetcher,
      dclParcelAccessUrl,
      AccessCheckerImpl.LOGGER
    )
    this.accessCheckerForProfiles = new AccessCheckerForProfiles(authenticator)
    this.accessCheckerForWearables = new AccessCheckerForWearables(
      authenticator,
      fetcher,
      dclCollectionsAccessUrl,
      AccessCheckerImpl.LOGGER
    )
  }

  async hasAccess(
    entityType: EntityType,
    pointers: Pointer[],
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<string[]> {
    switch (entityType) {
      case EntityType.SCENE:
        return this.accessCheckerForScenes.checkAccess(pointers, timestamp, ethAddress)
      case EntityType.PROFILE:
        return this.accessCheckerForProfiles.checkAccess(pointers, ethAddress)
      case EntityType.WEARABLE:
        return this.accessCheckerForWearables.checkAccess(pointers, ethAddress)
      default:
        return ['Unknown type provided']
    }
  }
}
