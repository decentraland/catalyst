import * as EthCrypto from "eth-crypto"
import { AuditInfo } from "../audit/Audit";

export class Authenticator {

    static DECENTRALAND_ADDRESS: EthAddress = "0x1337e0507eb4ab47e08a179573ed4533d9e22a7b"

    /** Return whether the given address used is owned by Decentraland */
    static isAddressOwnedByDecentraland(address: EthAddress) {
        return address.toLocaleLowerCase() === Authenticator.DECENTRALAND_ADDRESS
    }

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

    static createSimpleAuthChain(finalPayload: string, ownerAddress: EthAddress, signature: Signature): AuthChain {
        return [
            {
                type: AuthLinkType.SIGNER,
                payload: ownerAddress,
                signature: '',
            },{
                type: AuthLinkType.ECDSA_SIGNED_ENTITY,
                payload: finalPayload,
                signature: signature,
            }
        ]
    }

    static createAuthChain(ownerIdentity: IdentityType, ephemeralIdentity: IdentityType, ephemeralMinutesDuration: number, entityId: string): AuthChain {
        let expiration = new Date()
        expiration.setMinutes(expiration.getMinutes() + ephemeralMinutesDuration)

        const ephemeralMessage = `Decentraland Login\nEphemeral address: ${ephemeralIdentity.address}\nExpiration: ${expiration}`
        const firstSignature  = Authenticator.createSignature(ownerIdentity    , ephemeralMessage)
        const secondSignature = Authenticator.createSignature(ephemeralIdentity, entityId)

        const authChain: AuthChain = [
            {type: AuthLinkType.SIGNER             , payload: ownerIdentity.address, signature: ''},
            {type: AuthLinkType.ECDSA_EPHEMERAL    , payload: ephemeralMessage     , signature: firstSignature},
            {type: AuthLinkType.ECDSA_SIGNED_ENTITY, payload: entityId             , signature: secondSignature},
        ]

        return authChain
    }

    static createSignature(identity: IdentityType, message: string) {
        return EthCrypto.sign(identity.privateKey, Authenticator.createEthereumMessageHash(message))
    }

    static ownerAddress(auditInfo: AuditInfo): EthAddress {
        if (auditInfo.authChain.length > 0) {
            if (auditInfo.authChain[0].type === AuthLinkType.SIGNER) {
                return auditInfo.authChain[0].payload;
            }
        }
        return 'Invalid-Owner-Address'
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

export type IdentityType = {
    privateKey: string,
    publicKey: string,
    address: string
}

export type AuthChain = AuthLink[];

export type AuthLink = {
    type: AuthLinkType,
    payload: string,
    signature: Signature,
}

export enum AuthLinkType {
    SIGNER = 'SIGNER',
    ECDSA_EPHEMERAL = 'ECDSA_EPHEMERAL',
    ECDSA_SIGNED_ENTITY = 'ECDSA_SIGNED_ENTITY',
}
