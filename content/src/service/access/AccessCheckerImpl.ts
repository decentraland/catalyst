import { AccessChecker } from "./AccessChecker";
import fetch from "node-fetch"
import { EthAddress } from "../auth/Authenticator";
import { Pointer, EntityType } from "../Entity";

export class AccessCheckerImpl implements AccessChecker {

    async hasAccess(entityType: EntityType, pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        switch(entityType) {
            case EntityType.SCENE:
                return this.checkSceneAccess(pointers, ethAddress)
            case EntityType.PROFILE:
            case EntityType.WEARABLE:
                // TODO: Implement
                return []
        }
    }

    private async checkSceneAccess(pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        const errors: string[] = []

        const parcels: {x: number, y: number}[] = []

        // Transform pointers into parcels
        pointers.forEach(pointer => {
            const pointerParts: string[] = pointer.split(',')
            if (pointerParts.length === 2) {
                const x: number = parseInt(pointerParts[0], 10)
                const y: number = parseInt(pointerParts[1], 10)
                parcels.push({x, y})
            } else {
                errors.push(`Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: ${pointer}`)
            }
        })

        // Check that the address has access
        for (const {x, y} of parcels) {
            const hasAccess = await this.checkParcelAccess(x, y, ethAddress)
            if (!hasAccess) {
                errors.push(`The provided Eth Address does not have access to the following parcel: (${x},${y})`)
            }
        }

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

}