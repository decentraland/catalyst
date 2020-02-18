import log4js from "log4js"
import { AccessChecker } from "./AccessChecker";
import { EthAddress  } from "dcl-crypto";
import { Pointer, EntityType } from "../Entity";
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper";
import { ContentAuthenticator } from "../auth/Authenticator";

export class AccessCheckerImpl implements AccessChecker {

    private static readonly LOGGER = log4js.getLogger('AccessCheckerImpl');

    constructor(private readonly authenticator: ContentAuthenticator,
        private readonly dclApiBaseUrl: string,
        private readonly fetchHelper: FetchHelper) { }

    async hasAccess(entityType: EntityType, pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        switch(entityType) {
            case EntityType.SCENE:
                return this.checkSceneAccess(pointers, ethAddress)
            case EntityType.PROFILE:
                return this.checkProfileAccess(pointers, ethAddress)
            default:
                return ["Unknown type provided"]
        }
    }

    private async checkSceneAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
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
                        const hasAccess = await this.checkParcelAccess(x, y, ethAddress)
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

    private async checkParcelAccess(x: number, y: number, ethAddress: EthAddress): Promise<boolean> {

        const accessURL = `${this.dclApiBaseUrl}/parcels/${x}/${y}/${ethAddress}/authorizations`
        try {
            const responseJson = await this.fetchHelper.fetchJson(accessURL)
            return responseJson.data.isUpdateAuthorized
        } catch(e) {
            AccessCheckerImpl.LOGGER.warn(`Failed to check parcel access. Error was ${e.message}`)
        }
        return false
    }

    private async checkProfileAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        const errors: string[] = []

        if (pointers.length!=1) {
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

}