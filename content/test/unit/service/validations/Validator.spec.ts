import * as EthCrypto from "eth-crypto"
import { Validations } from "../../../../src/service/validations/Validations"
import { Entity, EntityType } from "../../../../src/service/Entity"
import { Authenticator } from "../../../../src/service/auth/Authenticator"
import { MockedAccessChecker } from "../../../helpers/service/access/MockedAccessChecker"
import { ValidationContext } from "@katalyst/content/service/validations/ValidationContext"
import { SignatureItem } from "@katalyst/content/service/audit/Audit"

describe("Validations", function () {

    it(`When a non uploaded hash is referenced, it is reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
            ["name-2", "hash-2"],
        ]))
        let validation = new Validations(new MockedAccessChecker())
        validation.validateContent(entity, new Map([
            ["hash-1", {name:"name-1", content: Buffer.from([])}]
        ]), new Map([]), ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe(notAvailableHashMessage("hash-2"))
    })

    it(`When a non available hash is referenced, it is reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
            ["name-2", "hash-2"],
        ]))
        let validation = new Validations(new MockedAccessChecker())
        validation.validateContent(entity, new Map([]), new Map([["hash-2", true]]), ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe(notAvailableHashMessage("hash-1"))
    })

    it(`When a hash is uploaded but not referenced, it is reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
        ]))
        let validation = new Validations(new MockedAccessChecker())
        validation.validateContent(entity, new Map([
            ["hash-1", {name:"name-1", content: Buffer.from([])}],
            ["hash-2", {name:"name-2", content: Buffer.from([])}]
        ]), new Map([]), ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe(notReferencedHashMessage("hash-2"))
    })

    it(`Already available but not referenced hashes are not reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
        ]))
        let validation = new Validations(new MockedAccessChecker())
        validation.validateContent(entity, new Map([
            ["hash-1", {name:"name-1", content: Buffer.from([])}],
        ]), new Map([
            ["hash-2", true]
        ]), ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(0)
    })

    it(`signature test`, async () => {
        const identity = EthCrypto.createIdentity();

        const message = 'foobar';
        const messageHash = EthCrypto.hash.keccak256(message);
        const signature = EthCrypto.sign(
            identity.privateKey,
            messageHash
        );

        const signer = EthCrypto.recover(
            signature,
            messageHash
        );

        expect(signer).toBe(identity.address)
    })

    it(`when signature is invalid, it's reported`, async () => {
        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature("some-entity-id", [{signature:"some-signature", signningAddress:"some-address"}], ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe("The signature is invalid.")
    })

    it(`when signature is valid, it's recognized`, async () => {
        const identity = EthCrypto.createIdentity();
        const entityId = "some-entity-id"
        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(
            entityId,
            [{
                signningAddress: identity.address,
                signature: EthCrypto.sign(
                    identity.privateKey,
                    Authenticator.createEthereumMessageHash(entityId)
                )
            }]
        , ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(0)
    })

    it(`when a valid chained signature is used, it's recognized`, async () => {
        const entityId = "some-entity-id"

        const ownerIdentity = EthCrypto.createIdentity();
        const ephemeralIdentity = EthCrypto.createIdentity();

        const firstSignature  = createSignature(ownerIdentity    , ephemeralIdentity.address)
        const secondSignature = createSignature(ephemeralIdentity, entityId)

        const signatures: SignatureItem[] = [
            {signature: firstSignature , signningAddress: ownerIdentity.address},
            {signature: secondSignature, signningAddress: ephemeralIdentity.address},
        ]

        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(entityId, signatures, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(0)
    })

    it(`when an invalid chained signature is used, it's reported`, async () => {
        const entityId = "some-entity-id"

        const ownerIdentity = EthCrypto.createIdentity();
        const ephemeralIdentity = EthCrypto.createIdentity();

        const firstSignature  = createSignature(ownerIdentity    , ephemeralIdentity.address)
        const secondSignature = createSignature(ephemeralIdentity, entityId)

        const signatures_second_is_invalid: SignatureItem[] = [
            {signature: firstSignature , signningAddress: ownerIdentity.address},
            {signature: 'invalid-signature', signningAddress: ephemeralIdentity.address},
        ]

        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(entityId, signatures_second_is_invalid, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe('The signature is invalid.')

        const signatures_first_is_invalid: SignatureItem[] = [
            {signature: 'invalid-signature', signningAddress: ownerIdentity.address},
            {signature: secondSignature, signningAddress: ephemeralIdentity.address},
        ]

        validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(entityId, signatures_first_is_invalid, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe('The signature is invalid.')
    })
    type IdentityType = {
        privateKey: string,
        publicKey: string,
        address: string
    }
    function createSignature(identity: IdentityType, message: string) {
        return EthCrypto.sign(identity.privateKey, Authenticator.createEthereumMessageHash(message))
    }

})

const notAvailableHashMessage = (hash) => {
    return `This hash is referenced in the entity but was not uploaded or previously available: ${hash}`
}

const notReferencedHashMessage = (hash) => {
    return `This hash was uploaded but is not referenced in the entity: ${hash}`
}