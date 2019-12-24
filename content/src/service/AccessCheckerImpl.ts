import { AccessChecker } from "./AccessChecker";
import { EthAddress } from "./Service";
import fetch from "node-fetch"

export class AccessCheckerImpl implements AccessChecker {

    async hasParcellAccess(x: number, y: number, ethAddress: EthAddress): Promise<boolean> {
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