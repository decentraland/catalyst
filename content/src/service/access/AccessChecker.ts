import { EthAddress } from "../Service";

export interface AccessChecker {

    hasParcelAccess(x: number, y: number, ethAddress: EthAddress): Promise<boolean>

}