import log4js from "log4js"
import { AccessChecker } from "./AccessChecker";
import { EthAddress } from "dcl-crypto";
import { Pointer, EntityType } from "../Entity";
import { ContentAuthenticator } from "../auth/Authenticator";
import { Timestamp } from "../time/TimeSorting";

export class AccessCheckerImpl implements AccessChecker {

    private static readonly LOGGER = log4js.getLogger('AccessCheckerImpl');

    constructor(
        private readonly authenticator: ContentAuthenticator,
        private readonly dclParcelAccessUrl: string) { }

    async hasAccess(entityType: EntityType, pointers: Pointer[], timestamp: Timestamp, ethAddress: EthAddress): Promise<string[]> {
        switch (entityType) {
            case EntityType.SCENE:
                return this.checkSceneAccess(pointers, timestamp, ethAddress)
            case EntityType.PROFILE:
                return this.checkProfileAccess(pointers, ethAddress)
            default:
                return ["Unknown type provided"]
        }
    }

    private async checkProfileAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        const errors: string[] = []

        if (pointers.length != 1) {
            errors.push(`Only one pointer is allowed when you create a Profile. Received: ${pointers}`)
        }

        const pointer: Pointer = pointers[0].toLocaleLowerCase()

        if (pointer.startsWith("default")) {
            if (!this.authenticator.isAddressOwnedByDecentraland(ethAddress)) {
                errors.push(`Only Decentraland can add or modify default profiles`)
            }
        } else if (pointer !== ethAddress.toLocaleLowerCase()) {
            errors.push(`You can only alter your own profile. The pointer address and the signer address are different.`)
        }

        return errors
    }

    private async checkSceneAccess(pointers: Pointer[], timestamp: Timestamp, ethAddress: EthAddress): Promise<string[]> {
        const errors: string[] = []

        await Promise.all(
            pointers
                .map(pointer => pointer.toLocaleLowerCase())
                .map(async pointer => {
                    if (pointer.startsWith("default")) {
                        if (!this.authenticator.isAddressOwnedByDecentraland(ethAddress)) {
                            errors.push(`Only Decentraland can add or modify default scenes`)
                        }
                    } else {
                        const pointerParts: string[] = pointer.split(',')
                        if (pointerParts.length === 2) {
                            const x: number = parseInt(pointerParts[0], 10)
                            const y: number = parseInt(pointerParts[1], 10)

                            // Check that the address has access
                            const hasAccess = await this.checkParcelAccess(x, y, timestamp, ethAddress)
                            if (!hasAccess) {
                                errors.push(`The provided Eth Address does not have access to the following parcel: (${x},${y})`)
                            }
                        } else {
                            errors.push(`Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: ${pointer}`)
                        }
                    }
                }))

        return errors
    }

    private async checkParcelAccess(x: number, y: number, timestamp: Timestamp, ethAddress: EthAddress): Promise<boolean> {
        const TOTAL_ATTEMPTS = 5
        for(let attempt=0; attempt<TOTAL_ATTEMPTS; attempt++) {
            try {
                return await this.isParcelUpdateAuthorized(x, y, timestamp, ethAddress)
            } catch (error) {
                AccessCheckerImpl.LOGGER.error(`Error checking parcel access (${x}, ${y}, ${timestamp}, ${ethAddress}). Attempt ${attempt+1} of ${TOTAL_ATTEMPTS}`, error)
            }
        }
        return false
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

        if (parcel.estates?.length > 0 && parcel.estates[0].estateId) {
            // The parcel belongs to an estate
            return this.isEstateUpdateAuthorized(
                parcel.estates[0].estateId,
                timestamp,
                ethAddress)
        }

        const firstLevelAuthorities = [
            ...parcel.owners,
            ...parcel.operators,
            ...parcel.updateOperators]
            .filter(addressSnapshot => addressSnapshot.address)
            .map(addressSnapshot => addressSnapshot.address.toLowerCase())

        ethAddress = ethAddress.toLowerCase()
        if (firstLevelAuthorities.includes(ethAddress)) {
            return true
        }

        /* You also get access if you received:
         *   - an auhtorization with isApproved and type Operator
         *   - an auhtorization with isApproved and type ApprovalForAll
         * at that time
         */

        const owner = parcel.owners[0].address.toLowerCase()

        const authorizations = await this.getAuthorizations(
            owner,
            ethAddress,
            timestamp)

        const firstOperatorAuthorization = authorizations.find(
            authorization => authorization.type === 'Operator')
        const firstApprovalForAllAuthorization = authorizations.find(
            authorization => authorization.type === 'ApprovalForAll')

        if (firstOperatorAuthorization?.isApproved || firstApprovalForAllAuthorization?.isApproved) {
            return true
        }

        return false
    }

    private async isEstateUpdateAuthorized(
        estateId: number,
        timestamp: Timestamp,
        ethAddress: EthAddress
    ): Promise<boolean> {
        const estate = await this.getEstate(estateId.toString(), timestamp)

        const firstLevelAuthorities = [
            ...estate.owners,
            ...estate.operators,
            ...estate.updateOperators]
            .filter(addressSnapshot => addressSnapshot.address)
            .map(addressSnapshot => addressSnapshot.address.toLowerCase())

        ethAddress = ethAddress.toLowerCase()
        if (firstLevelAuthorities.includes(ethAddress)) {
            return true
        }

        /* You also get access if you received:
         *   - an auhtorization with isApproved and type Operator
         *   - an auhtorization with isApproved and type ApprovalForAll
         * at that time
         */

        const owner = estate.owners[0].address.toLowerCase()

        const authorizations = await this.getAuthorizations(
            owner,
            ethAddress,
            timestamp)

        const firstOperatorAuthorization = authorizations.find(
            authorization => authorization.type === 'Operator')
        const firstApprovalForAllAuthorization = authorizations.find(
            authorization => authorization.type === 'ApprovalForAll')

        if (firstOperatorAuthorization?.isApproved || firstApprovalForAllAuthorization?.isApproved) {
            return true
        }

        return false
    }


    private async getParcel(x: number, y: number, timestamp: Timestamp): Promise<Parcel> {
        /**
         * You can use `owner`, `operator` and `updateOperator` to check the current value for that parcel.
         * Keep in mind that each association (owners, operators, etc) is capped to a thousand (1000) results.
         * For more information, you can use the query explorer at https://thegraph.com/explorer/subgraph/nicosantangelo/watchtower
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
                            orderBy: createdAt,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    operators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: createdAt,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    updateOperators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: createdAt,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                }
            }`

        const variables = {
            x, y,
            timestamp: Math.floor(timestamp / 1000) // UNIX
        }

        try {
            const response = await this.queryGraph<{ parcels: Parcel[] }>(
                query,
                variables
            )
            return response.parcels[0]
        } catch (error) {
            AccessCheckerImpl.LOGGER.error(`Error fetching parcel (${x}, ${y})`, error)
            throw error
        }
    }

    private async getEstate(estateId: string, timestamp: Timestamp): Promise<Estate> {
        /**
         * You can use `owner`, `operator` and `updateOperator` to check the current value for that estate.
         * Keep in mind that each association (owners, operators, etc) is capped to a thousand (1000) results.
         * For more information, you can use the query explorer at https://thegraph.com/explorer/subgraph/nicosantangelo/watchtower
         */

        const query = `
            query GetEstate($estateId: String!, $timestamp: Int!) {
                estates(where:{ id: $estateId }) {
                    id
                    owners(
                            where: { createdAt_lte: $timestamp },
                            orderBy: createdAt,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    operators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: createdAt,
                            orderDirection: desc,
                            first: 1
                        ) {
                        address
                    }
                    updateOperators(
                            where: { createdAt_lte: $timestamp },
                            orderBy: createdAt,
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
            const response = await this.queryGraph<{ estates: Estate[] }>(
                query,
                variables
            )
            return response.estates[0]
        } catch (error) {
            AccessCheckerImpl.LOGGER.error(`Error fetching estate (${estateId})`, error)
            throw error
        }
    }

    private async getAuthorizations(owner: EthAddress, operator: EthAddress, timestamp: Timestamp): Promise<Authorization[]> {
        const query = `
            query GetAuthorizations($owner: String!, $operator: String!, $timestamp: String!) {
                authorizations(
                        where: {
                            owner: $owner,
                            operator: $operator,
                            createdAt_lte: $timestamp
                        },
                        orderBy: createdAt,
                        orderDirection: desc
                    ) {
                    type
                    isApproved
                }
            }`

        const variables = {
            owner,
            operator,
            timestamp: Math.floor(timestamp / 1000) // UNIX
        }

        try {
            const response = await this.queryGraph<{
                authorizations: Authorization[]
            }>(query, variables)
            return response.authorizations
        } catch (error) {
            AccessCheckerImpl.LOGGER.error(`Error fetching authorizations for ${owner}`, error)
            throw error
        }
    }

    // TODO: Move this to FetchHelper5
    private async queryGraph<T = any>(
        query: string,
        variables: Record<string, any>
    ): Promise<T> {
        const opts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        }

        const res = await fetch(this.dclParcelAccessUrl, opts)
        if (res.ok) {
            const json = await res.json()
            if (json.errors) {
                throw new Error(
                    `Error querying graph. Reasons: ${JSON.stringify(json.errors)}`
                )
            }
            return json.data
        }

        throw new Error(
            `Could not query graph. Reason: ${res.status}: ${res.statusText}`
        )
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
    type: 'Operator' | 'ApprovalForAll'
    isApproved: boolean
}
