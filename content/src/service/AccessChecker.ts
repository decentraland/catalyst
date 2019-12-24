import { EthAddress } from "./Service";

export interface AccessChecker {

    hasParcellAccess(x: number, y: number, ethAddress: EthAddress): Promise<boolean>

}