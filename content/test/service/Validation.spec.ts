import { Validation } from "../../src/service/Validation"
import { Entity, EntityType } from "../../src/service/Entity"
import * as EthCrypto from "eth-crypto"
import { MockedAccessChecker } from "./access/MockedAccessChecker"

describe("Validation", function () {

    it(`When a non uploaded hash is referenced, it is reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
            ["name-2", "hash-2"],
        ]))
        let validation = new Validation(new MockedAccessChecker())
        validation.validateContent(entity, new Map([
            ["hash-1", {name:"name-1", content: Buffer.from([])}]
        ]), new Map([]))

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe(notAvailableHashMessage("hash-2"))
    })

    it(`When a non available hash is referenced, it is reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
            ["name-2", "hash-2"],
        ]))
        let validation = new Validation(new MockedAccessChecker())
        validation.validateContent(entity, new Map([]), new Map([["hash-2", true]]))

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe(notAvailableHashMessage("hash-1"))
    })

    it(`When a hash is uploaded but not referenced, it is reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
        ]))
        let validation = new Validation(new MockedAccessChecker())
        validation.validateContent(entity, new Map([
            ["hash-1", {name:"name-1", content: Buffer.from([])}],
            ["hash-2", {name:"name-2", content: Buffer.from([])}]
        ]), new Map([]))

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe(notReferencedHashMessage("hash-2"))
    })

    it(`Already available but not referenced hashes are not reported`, () => {
        let entity = new Entity("id", EntityType.SCENE, [], Date.now(), new Map([
            ["name-1", "hash-1"],
        ]))
        let validation = new Validation(new MockedAccessChecker())
        validation.validateContent(entity, new Map([
            ["hash-1", {name:"name-1", content: Buffer.from([])}],
        ]), new Map([
            ["hash-2", true]
        ]))

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
        let validation = new Validation(new MockedAccessChecker())
        await validation.validateSignature("some-entity-id", "some-address", "some-signature")

        expect(validation.getErrors().length).toBe(1)
        expect(validation.getErrors()[0]).toBe("The signature is invalid.")
    })

    it(`when signature is valid, it's recognized`, async () => {
        const identity = EthCrypto.createIdentity();
        const entityId = "some-entity-id"
        let validation = new Validation(new MockedAccessChecker())
        await validation.validateSignature(
            entityId,
            identity.address,
            EthCrypto.sign(
                identity.privateKey,
                Validation.createEthereumMessageHash(entityId)
            )
        )

        expect(validation.getErrors().length).toBe(0)
    })

})

const notAvailableHashMessage = (hash) => {
    return `This hash is referenced in the entity but was not uploaded or previously available: ${hash}`
}

const notReferencedHashMessage = (hash) => {
    return `This hash was uploaded but is not referenced in the entity: ${hash}`
}