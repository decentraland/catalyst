import { AccessChecker } from "./AccessChecker";
import fetch from "node-fetch"
import { EthAddress, Authenticator } from "../auth/Authenticator";
import { Pointer, EntityType } from "../Entity";

export class AccessCheckerImpl implements AccessChecker {

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

        pointers.map(pointer => pointer.toLocaleLowerCase())
            .forEach(async pointer => {
                if (pointer.startsWith("default")) {
                    if (!Authenticator.isAddressOwnedByDecentraland(ethAddress)) {
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
            })

        return errors
    }

    private async checkParcelAccess(x: number, y: number, ethAddress: EthAddress): Promise<boolean> {
        const dclApiBaseUrl = "https://api.decentraland.org/v1"
        const accessURL = `${dclApiBaseUrl}/parcels/${x}/${y}/${ethAddress}/authorizations`
        try {
            const response = await fetch(accessURL)
            const responseJson = await response.json()
            return responseJson.data.isUpdateAuthorized
        } catch(e) {
            console.error(e)
        }
        return false
    }

    private async checkProfileAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        const errors: string[] = []

        if (pointers.length!=1) {
            errors.push(`Only one pointer is allowed when you create a Profile. Received: ${pointers}`)
        }

        if (pointers[0].toLocaleLowerCase() !== ethAddress.toLocaleLowerCase()) {
            errors.push(`You can only alter your own profile. The pointer address and the signer address are different.`)
        }

        return errors
    }

}