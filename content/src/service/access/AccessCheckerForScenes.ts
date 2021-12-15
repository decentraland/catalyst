import { Fetcher, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import ms from 'ms'
import { retry } from '../../helpers/RetryHelper'
import { ContentAuthenticator } from '../auth/Authenticator'

export class AccessCheckerForScenes {
  private static readonly SCENE_LOOKBACK_TIME = ms('5m')

  constructor(
    private readonly authenticator: ContentAuthenticator,
    private readonly fetcher: Fetcher,
    private readonly landManagerSubgraphUrl: string,
    private readonly LOGGER: log4js.Logger
  ) {}

  public async checkAccess({
    pointers,
    timestamp,
    ethAddress
  }: {
    pointers: Pointer[]
    timestamp: Timestamp
    ethAddress: EthAddress
  }): Promise<string[]> {
    const errors: string[] = []

    await Promise.all(
      pointers
        .map((pointer) => pointer.toLowerCase())
        .map(async (pointer) => {
          if (pointer.startsWith('default')) {
            if (!this.authenticator.isAddressOwnedByDecentraland(ethAddress)) {
              errors.push(`Only Decentraland can add or modify default scenes`)
            }
          } else {
            const pointerParts: string[] = pointer.split(',')
            if (pointerParts.length === 2) {
              const x: number = parseInt(pointerParts[0], 10)
              const y: number = parseInt(pointerParts[1], 10)
              try {
                // Check that the address has access (we check both the present and the 5 min into the past to avoid synchronization issues in the blockchain)
                const hasAccess =
                  (await this.checkParcelAccess(x, y, timestamp, ethAddress)) ||
                  (await this.checkParcelAccess(
                    x,
                    y,
                    timestamp - AccessCheckerForScenes.SCENE_LOOKBACK_TIME,
                    ethAddress
                  ))
                if (!hasAccess) {
                  errors.push(`The provided Eth Address does not have access to the following parcel: (${x},${y})`)
                }
              } catch (e) {
                errors.push(`The provided Eth Address does not have access to the following parcel: (${x},${y}). ${e}`)
              }
            } else {
              errors.push(
                `Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: ${pointer}`
              )
            }
          }
        })
    )

    return errors
  }

  private async checkParcelAccess(
    x: number,
    y: number,
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<boolean> {
    try {
      return await retry(
        () => this.isParcelUpdateAuthorized(x, y, timestamp, ethAddress),
        5,
        `check parcel access (${x}, ${y}, ${timestamp}, ${ethAddress})`,
        '0.1s'
      )
    } catch (error) {
      this.LOGGER.error(`Error checking parcel access (${x}, ${y}, ${timestamp}, ${ethAddress}).`, error)
      throw error
    }
  }

  /**
   * Checks if the address had deployment access to that coordinate at the specified time.
   */
  private async isParcelUpdateAuthorized(
    x: number,
    y: number,
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<boolean> {
    /* You get direct access if you were the:
     *   - owner
     *   - operator
     *   - update operator
     * at that time
     */
    const parcel = await this.getParcel(x, y, timestamp)
    if (parcel) {
      const belongsToEstate: boolean =
        parcel.estates != undefined && parcel.estates.length > 0 && parcel.estates[0].estateId != undefined

      return (
        (await this.hasAccessThroughFirstLevelAuthorities(parcel, ethAddress)) ||
        (await this.hasAccessThroughAuthorizations(parcel.owners[0].address, ethAddress, timestamp)) ||
        (belongsToEstate && (await this.isEstateUpdateAuthorized(parcel.estates[0].estateId, timestamp, ethAddress)))
      )
    }
    throw new Error(`Parcel(${x},${y},${timestamp}) not found`)
  }

  private async isEstateUpdateAuthorized(
    estateId: number,
    timestamp: Timestamp,
    ethAddress: EthAddress
  ): Promise<boolean> {
    const estate = await this.getEstate(estateId.toString(), timestamp)
    if (estate) {
      return (
        (await this.hasAccessThroughFirstLevelAuthorities(estate, ethAddress)) ||
        (await this.hasAccessThroughAuthorizations(estate.owners[0].address, ethAddress, timestamp))
      )
    }
    return false
  }

  private async hasAccessThroughFirstLevelAuthorities(
    target: AuthorizationHistory,
    ethAddress: EthAddress
  ): Promise<boolean> {
    const firstLevelAuthorities = [...target.owners, ...target.operators, ...target.updateOperators]
      .filter((addressSnapshot) => addressSnapshot.address)
      .map((addressSnapshot) => addressSnapshot.address.toLowerCase())
    return firstLevelAuthorities.includes(ethAddress.toLowerCase())
  }

  private async hasAccessThroughAuthorizations(
    owner: EthAddress,
    ethAddress: EthAddress,
    timestamp: Timestamp
  ): Promise<boolean> {
    /* You also get access if you received:
     *   - an authorization with isApproved and type Operator, ApprovalForAll or UpdateManager
     * at that time
     */
    const authorizations = await this.getAuthorizations(owner.toLowerCase(), ethAddress.toLowerCase(), timestamp)

    const firstOperatorAuthorization = authorizations.find((authorization) => authorization.type === 'Operator')
    const firstApprovalForAllAuthorization = authorizations.find(
      (authorization) => authorization.type === 'ApprovalForAll'
    )
    const firstUpdateManagerAuthorization = authorizations.find(
      (authorization) => authorization.type === 'UpdateManager'
    )

    if (
      firstOperatorAuthorization?.isApproved ||
      firstApprovalForAllAuthorization?.isApproved ||
      firstUpdateManagerAuthorization?.isApproved
    ) {
      return true
    }

    return false
  }

  private async getParcel(x: number, y: number, timestamp: Timestamp): Promise<Parcel | undefined> {
    /**
     * You can use `owner`, `operator` and `updateOperator` to check the current value for that parcel.
     * Keep in mind that each association (owners, operators, etc) is capped to a thousand (1000) results.
     * For more information, you can use the query explorer at https://thegraph.com/explorer/subgraph/decentraland/land-manager
     */

    const query = `
            query GetParcel($x: Int!, $y: Int!, $timestamp: Int!) {
                parcels(where:{ x: $x, y: $y }) {
                    estates(
                            where: { createdAt_lte: $timestamp },
                            orderBy: createdAt,
                            orderDirection: desc,
                            first: 1
                        ) {
                        estateId
                    }
                    owners(
                            where: { createdAt_lte: $timestamp },
                            orderBy: timestamp,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    operators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: timestamp,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    updateOperators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: timestamp,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                }
            }`

    const variables = {
      x,
      y,
      timestamp: Math.floor(timestamp / 1000) // UNIX
    }

    try {
      const r = await this.fetcher.queryGraph<{ parcels: Parcel[] }>(this.landManagerSubgraphUrl, query, variables)

      if (r.parcels && r.parcels.length) return r.parcels[0]

      this.LOGGER.error(`Error fetching parcel (${x}, ${y}): ${JSON.stringify(r)}`)
      throw new Error(`Error fetching parcel (${x}, ${y})`)
    } catch (error) {
      this.LOGGER.error(`Error fetching parcel (${x}, ${y})`, error)
      throw error
    }
  }

  private async getEstate(estateId: string, timestamp: Timestamp): Promise<Estate | undefined> {
    /**
     * You can use `owner`, `operator` and `updateOperator` to check the current value for that estate.
     * Keep in mind that each association (owners, operators, etc) is capped to a thousand (1000) results.
     * For more information, you can use the query explorer at https://thegraph.com/explorer/subgraph/decentraland/land-manager
     */

    const query = `
            query GetEstate($estateId: String!, $timestamp: Int!) {
                estates(where:{ id: $estateId }) {
                    id
                    owners(
                            where: { createdAt_lte: $timestamp },
                            orderBy: timestamp,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    operators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: timestamp,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    updateOperators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: timestamp,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                }
            }`

    const variables = {
      estateId,
      timestamp: Math.floor(timestamp / 1000) // UNIX
    }

    try {
      return (await this.fetcher.queryGraph<{ estates: Estate[] }>(this.landManagerSubgraphUrl, query, variables))
        .estates[0]
    } catch (error) {
      this.LOGGER.error(`Error fetching estate (${estateId})`, error)
      throw error
    }
  }

  private async getAuthorizations(
    owner: EthAddress,
    operator: EthAddress,
    timestamp: Timestamp
  ): Promise<Authorization[]> {
    const query = `
            query GetAuthorizations($owner: String!, $operator: String!, $timestamp: Int!) {
                authorizations(
                        where: {
                            owner: $owner,
                            operator: $operator,
                            createdAt_lte: $timestamp
                        },
                        orderBy: timestamp,
                        orderDirection: desc
                    ) {
                    type
                    isApproved
                }
            }`

    const variables = {
      owner,
      operator,
      timestamp: Math.floor(timestamp / 1000) // js(ms) -> UNIX(s)
    }

    try {
      return (
        await this.fetcher.queryGraph<{ authorizations: Authorization[] }>(
          this.landManagerSubgraphUrl,
          query,
          variables
        )
      ).authorizations
    } catch (error) {
      this.LOGGER.error(`Error fetching authorizations for ${owner}`, error)
      throw error
    }
  }
}

type AddressSnapshot = {
  address: string
}

type EstateSnapshot = {
  estateId: number
}

type Estate = AuthorizationHistory & {
  id: number
}

type Parcel = AuthorizationHistory & {
  x: number
  y: number
  estates: EstateSnapshot[]
}

type AuthorizationHistory = {
  owners: AddressSnapshot[]
  operators: AddressSnapshot[]
  updateOperators: AddressSnapshot[]
}

type Authorization = {
  type: 'Operator' | 'ApprovalForAll' | 'UpdateManager'
  isApproved: boolean
}
