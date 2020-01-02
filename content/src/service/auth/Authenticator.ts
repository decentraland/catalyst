import * as EthCrypto from "eth-crypto"

export class Authenticator {

    /** Validate that the signature belongs to the Ethereum address */
    static async validateSignature(msg: string, ethAddress: EthAddress, signature: Signature): Promise<boolean> {
        return Authenticator.isSignatureValid(msg, ethAddress, signature)
    }

    private static async isSignatureValid(msg: string, ethAddress: string, signature: string): Promise<boolean> {
        try {
            const signerAddress = EthCrypto.recover(signature, Authenticator.createEthereumMessageHash(msg));
            return ethAddress == signerAddress
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