import * as EthCrypto from "eth-crypto"
import { Validations } from "../../../../src/service/validations/Validations"
import { Entity, EntityType } from "../../../../src/service/Entity"
import { Authenticator, AuthChain, AuthLinkType } from "../../../../src/service/auth/Authenticator"
import { MockedAccessChecker } from "../../../helpers/service/access/MockedAccessChecker"
import { ValidationContext } from "@katalyst/content/service/validations/ValidationContext"
import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl"

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

    it(`signature test on ipfs hash`, async () => {
        const message = 'QmUX9jcGbUATv4MAZaMGT9qiDJb59KBhN8TkyeGsWwzHon';
        const signature = '0x7f34bc8e3bce648c7e31705172f10b171777eda2d6b87cc53d581faa0ed0f518281691afc6ac51fd7848ba5464642878ae7728e13819dd359f1c9a15e15013fb1b';
        const expectedSigner = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
        validateExpectedAddress(message, signature, expectedSigner)
    })

    it(`signature test on human readable message`, async () => {
        const message = 'Decentraland Login\nEphemeral address: 0x1F19d3EC0BE294f913967364c1D5B416e6A74555\nExpiration: Tue Jan 21 2020 16:34:32 GMT+0000 (Coordinated Universal Time)'
        const signature = '0x49c5d57fc804e6a06f83ee8d499aec293a84328766864d96349db599ef9ebacc072892ec1f3e2777bdc8265b53d8b84edd646bdc711dd5290c18adcc5de4a2831b';
        const expectedSigner = '0x1f19d3ec0be294f913967364c1d5b416e6a74555'
        validateExpectedAddress(message, signature, expectedSigner)
    })

    it(`signature test on human readable message 2`, async () => {
        const identity = EthCrypto.createIdentity();
        let expiration = new Date()
        expiration.setMinutes(expiration.getMinutes() + 30)

        const message = `Decentraland Login\nEphemeral address: ${identity.address}\nExpiration: ${expiration}`
        const signature = Authenticator.createSignature(identity, message);
        const expectedSigner = identity.address.toLocaleLowerCase()
        validateExpectedAddress(message, signature, expectedSigner)
    })

    it(`signature test on human readable message 3`, async () => {
        const message = 'Decentraland Login\nEphemeral address: ${ephemeralIdentity.address}\nExpiration: ${expiration}';
        const signature = '0x93e6c60fbe79e5a6b94c2f560730eaf1b8eeac4859046ac90d3cff14f9be65aa6d7fad907ce320979d56848d7d7c13cb10295d739eb2a3d99f0e6e9cba56ff7c1b';
        const expectedSigner = '0xe4d3ba99ffdae47c003f1756c01d8e7ee8fef7c9'
        validateExpectedAddress(message, signature, expectedSigner)
    })

    it(`signature test on human readable message 4`, async () => {
        const identity = EthCrypto.createIdentity();
        const message = 'Decentraland Login\nEphemeral';
        const signature = Authenticator.createSignature(identity, message);
        const expectedSigner = identity.address.toLocaleLowerCase()
        validateExpectedAddress(message, signature, expectedSigner)
    })

    it(`signature test on human readable message 4b`, async () => {
        const message = 'Decentraland Login\nEphemeral';
        const signature = '0x4163812d18beaa732edc4c9d106c4824b7efa565b96841e0a3d9c1863112cab627fb1d7ff7c1b3330d7c5021b76852080d349f7dfd26d59afdac21fc378d51a21b';
        const expectedSigner = '0xd5af26a5adfc888843d765da9a5cda6f1416eb9d'
        validateExpectedAddress(message, signature, expectedSigner)
    })

    it(`signature test on human readable message 5`, async () => {
        const identity = EthCrypto.createIdentity();
        const message = 'Decentraland Login Ephemeral';
        const signature = Authenticator.createSignature(identity, message);
        const expectedSigner = identity.address.toLocaleLowerCase()
        validateExpectedAddress(message, signature, expectedSigner)
    })

    it(`signature test on human readable message 5b`, async () => {
        const message = 'Decentraland Login Ephemeral';
        const signature = '0x29561864c8c058688dc5043e04a1dc234d7cbd9201d26029402c0ca4d86d3a337e200f4136dbf40ada341674c79ece56946720b20bc645dd3cc029ab824680891b';
        const expectedSigner = '0xf37cb6620d0efcfdaf4a166e3ddd75daa4975b39'
        validateExpectedAddress(message, signature, expectedSigner)
    })

    function validateExpectedAddress(message: string, signature: string, expectedSigner: string ) {
        const messageHash = Authenticator.createEthereumMessageHash(message);

        const signer = EthCrypto.recover(
            signature,
            messageHash
        ).toLocaleLowerCase();

        expect(signer).toBe(expectedSigner)
    }

    it(`when signature is invalid, it's reported`, async () => {
        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature("some-entity-id", Authenticator.createSimpleAuthChain("some-entity-id", "some-address", "some-signature"), ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe("The signature is invalid.")
    })

    it(`when signature is valid, it's recognized`, async () => {
        const identity = EthCrypto.createIdentity();
        const entityId = "some-entity-id"
        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(
            entityId,
            Authenticator.createSimpleAuthChain(entityId, identity.address, EthCrypto.sign(
                identity.privateKey,
                Authenticator.createEthereumMessageHash(entityId)
            ))
        , ValidationContext.ALL)

        expect(validation.getErrors().length).toBe(0)
    })

    it(`when a valid chained signature is used, it's recognized`, async () => {
        const entityId = "some-entity-id"

        const ownerIdentity = EthCrypto.createIdentity();
        const ephemeralIdentity = EthCrypto.createIdentity();

        const authChain = Authenticator.createAuthChain(ownerIdentity, ephemeralIdentity, 30, entityId)

        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(entityId, authChain, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(0)
    })

    it(`when an invalid chained signature is used, it's reported`, async () => {
        const entityId = "some-entity-id"

        const ownerIdentity = EthCrypto.createIdentity();
        const ephemeralIdentity = EthCrypto.createIdentity();

        const signatures_second_is_invalid = Authenticator.createAuthChain(ownerIdentity, ephemeralIdentity, 30, entityId)
        signatures_second_is_invalid[2].signature = 'invalid-signature'

        let validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(entityId, signatures_second_is_invalid, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe('The signature is invalid.')

        const signatures_first_is_invalid = Authenticator.createAuthChain(ownerIdentity, ephemeralIdentity, 30, entityId)
        signatures_first_is_invalid[1].signature = 'invalid-signature'

        validation = new Validations(new MockedAccessChecker())
        await validation.validateSignature(entityId, signatures_first_is_invalid, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe('The signature is invalid.')
    })

    it(`when no signature are provided, it's reported`, async () => {
        const validation = new Validations(new MockedAccessChecker())
        const invalidAuthChain: AuthChain = []
        await validation.validateSignature("some-entity-id", invalidAuthChain, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe('The signature is invalid.')
    })

    it(`when only signer link is provided, it's reported`, async () => {
        const validation = new Validations(new MockedAccessChecker())
        const ownerIdentity = EthCrypto.createIdentity();
        const invalidAuthChain: AuthChain = [
            {type: AuthLinkType.SIGNER, payload: ownerIdentity.address, signature: ''},
        ]
        await validation.validateSignature("some-entity-id", invalidAuthChain, ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe('The signature is invalid.')
    })

    it(`when a profile is created its access is checked`, async () => {
        const validation = new Validations(new AccessCheckerImpl())
        await validation.validateAccess(EntityType.PROFILE, ['some-address'], 'some-address', ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(0)
    })

    it(`when a profile is created and too many pointers are sent, the access check fails`, async () => {
        const validation = new Validations(new AccessCheckerImpl())
        await validation.validateAccess(EntityType.PROFILE, ['some-address', 'other-address'], 'some-address', ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
    })

    it(`when a profile is created and the pointers does not match the signer, the access check fails`, async () => {
        const validation = new Validations(new AccessCheckerImpl())
        await validation.validateAccess(EntityType.PROFILE, ['other-address'], 'some-address', ValidationContext.ALL)
        expect(validation.getErrors().length).toBe(1)
    })

})

const notAvailableHashMessage = (hash) => {
    return `This hash is referenced in the entity but was not uploaded or previously available: ${hash}`
}

const notReferencedHashMessage = (hash) => {
    return `This hash was uploaded but is not referenced in the entity: ${hash}`
}