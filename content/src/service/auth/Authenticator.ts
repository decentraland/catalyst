import * as EthCrypto from "eth-crypto"
import { SignatureItem } from "../audit/Audit";

export class Authenticator {

    /** Validate that the signature belongs to the Ethereum address */
    static async validateSignature(msg: string, signatures: SignatureItem[]): Promise<boolean> {
        if (!signatures || signatures.length < 1) {
            return false
        }
        return this.internalValidateSignature(msg, signatures)
    }

    private static async internalValidateSignature(msg: string, signatures: SignatureItem[]): Promise<boolean> {
        if (signatures.length==0) {
            return true
        }
        const currentItem = signatures[signatures.length-1]
        if (await Authenticator.isSignatureValid(msg, currentItem.signingAddress, currentItem.signature)) {
            return await this.internalValidateSignature(currentItem.signingAddress, signatures.slice(0, -1))
        }
        return false
    }

    private static async isSignatureValid(msg: string, ethAddress: string, signature: string): Promise<boolean> {
        try {
            const signerAddress = EthCrypto.recover(signature, Authenticator.createEthereumMessageHash(msg));
            return ethAddress.toLocaleLowerCase() === signerAddress.toLocaleLowerCase()
        } catch (e) {
            // console.error(e)
        }
        return false
    }

    static createEthereumMessageHash(msg: string) {
        let msgWithPrefix: string = `\x19Ethereum Signed Message:\n${msg.length}${msg}`
        const msgHash = EthCrypto.hash.keccak256(msgWithPrefix);
        return msgHash
    }
}

export type Signature = string
export type EthAddress = string