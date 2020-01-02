import { EthAddress } from "../auth/Authenticator";

export interface AccessChecker {

    hasParcelAccess(x: number, y: number, ethAddress: EthAddress): Promise<boolean>

}