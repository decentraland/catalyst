import * as EthCrypto from "eth-crypto"
import { Validations } from "../../../../src/service/validations/Validations"
import { Entity, EntityType } from "../../../../src/service/Entity"
import { Authenticator, AuthChain, AuthLinkType } from "../../../../src/service/auth/Authenticator"
import { MockedAccessChecker } from "../../../helpers/service/access/MockedAccessChecker"
import { ValidationContext } from "@katalyst/content/service/validations/ValidationContext"

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

    // it(`signature test for Nacho`, async () => {
    //     const message = '0xe79f0e594d5aca4260c4956b519240c056783985fc42f2472cac6732ca26699c';
    //     const messageHash = Authenticator.createEthereumMessageHash(message);
    //     const signature = '0xf4e4ff3339e374411128e61a3ed2b7cf0a146ad4574ddc0a04f85379a306a4df194c1f808d07c4d762a7ab642a237e8547cb5032a102582a8aa508047f321ff21c';

    //     const signer = EthCrypto.recover(
    //         signature,
    //         messageHash
    //     );
    //     console.log(signer) // => 0x9337D3BE7d13b6D61e9B5CF47d9f048b3739E1f0

    //     expect(signer).toBe('0xa578a36D3bc9d69e855A3faf0Edb54495238d2fb')
    // })

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

})

const notAvailableHashMessage = (hash) => {
    return `This hash is referenced in the entity but was not uploaded or previously available: ${hash}`
}

const notReferencedHashMessage = (hash) => {
    return `This hash was uploaded but is not referenced in the entity: ${hash}`
}