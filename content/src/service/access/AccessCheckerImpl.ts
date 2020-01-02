import { AccessChecker } from "./AccessChecker";
import fetch from "node-fetch"
import { EthAddress } from "../auth/Authenticator";

export class AccessCheckerImpl implements AccessChecker {

    async hasParcelAccess(x: number, y: number, ethAddress: EthAddress): Promise<boolean> {
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