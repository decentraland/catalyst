import * as EthCrypto from "eth-crypto"
import { AuthChain, AuthLink, AuthLinkType } from "../audit/Audit";

export class Authenticator {

    /** Validate that the signature belongs to the Ethereum address */
    static async validateSignature(expectedFinalAuthority: string, authChain: AuthChain): Promise<boolean> {
        let currentAuthority: string = ''
        authChain.forEach(authLink => {
            const validator: ValidatorType = getValidatorByType(authLink.type)
            const {error, nextAuthority} = validator(currentAuthority, authLink)
            if (error) {
                return false
            }
            currentAuthority = nextAuthority ?? ''
        });
        return currentAuthority === expectedFinalAuthority
    }

    static createEthereumMessageHash(msg: string) {
        let msgWithPrefix: string = `\x19Ethereum Signed Message:\n${msg.length}${msg}`
        const msgHash = EthCrypto.hash.keccak256(msgWithPrefix);
        return msgHash
    }
}

type ValidatorType = (authority: string, authLink: AuthLink) => {error?: boolean, nextAuthority?: string}

const SIGNER_VALIDATOR: ValidatorType = (authority: string, authLink: AuthLink) => {
    return {nextAuthority: authLink.payload}
}

const ECDSA_SIGNED_ENTITY_VALIDATOR: ValidatorType = (authority: string, authLink: AuthLink) => {
    try {
        const signerAddress = EthCrypto.recover(authLink.signature, Authenticator.createEthereumMessageHash(authLink.payload));
        if (authority.toLocaleLowerCase() === signerAddress.toLocaleLowerCase()) {
            return {nextAuthority: authLink.payload}
        }
    } catch (e) {
        // console.error(e)
    }
    return {error: true}
}

const ECDSA_EPHEMERAL_VALIDATOR: ValidatorType = (authority: string, authLink: AuthLink) => {
    try {
        // authLink payload structure: <human-readable message>\nEphemeral address: <ephemeral-eth-address>\nExpiration: <timestamp>
        // authLink payload example  : Decentraland Login\nEphemeral address: 0x123456\nExpiration: 2020-01-20T22:57:11.334Z
        const payloadParts: string[] = authLink.payload.split('\n')
        const ephemeralAddress: string = payloadParts[1].substring("Ephemeral address: ".length)
        const expirationString: string = payloadParts[2].substring("Expiration: ".length)
        const expiration = Date.parse(expirationString)

        if (expiration > Date.now()) {
            const signerAddress = EthCrypto.recover(authLink.signature, Authenticator.createEthereumMessageHash(authLink.payload));
            if (authority.toLocaleLowerCase() === signerAddress.toLocaleLowerCase()) {
                return {nextAuthority: ephemeralAddress}
            }
        }
    } catch (e) {
        // console.error(e)
    }
    return {error: true}
}

const ERROR_VALIDATOR: ValidatorType = (authority: string, authLink: AuthLink) => {
    return {error: true}
}

function getValidatorByType(type: AuthLinkType): ValidatorType {
    switch(type) {
        case AuthLinkType.SIGNER: return SIGNER_VALIDATOR
        case AuthLinkType.ECDSA_EPHEMERAL: return ECDSA_EPHEMERAL_VALIDATOR
        case AuthLinkType.ECDSA_SIGNED_ENTITY: return ECDSA_SIGNED_ENTITY_VALIDATOR
        default: return ERROR_VALIDATOR
    }
}

export type Signature = string
export type EthAddress = string