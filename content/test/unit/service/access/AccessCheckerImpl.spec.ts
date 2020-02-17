import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl";
import { EntityType } from "@katalyst/content/service/Entity";
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator";
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper";

describe("AccessCheckerImpl", function () {

    it(`When a non-decentraland address tries to deploy an default scene, then an error is returned`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url', new FetchHelper());

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default scenes")
    })

    it(`When a decentraland address tries to deploy an default scene, then it is allowed`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url', new FetchHelper());

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], ContentAuthenticator.DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })

    it(`When a non-decentraland address tries to deploy an default profile, then an error is returned`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url', new FetchHelper());

        const errors = await accessChecker.hasAccess(EntityType.PROFILE, ["Default10"], "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default profiles")
    })

    it(`When a decentraland address tries to deploy an default profile, then it is allowed`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url', new FetchHelper());

        const errors = await accessChecker.hasAccess(EntityType.PROFILE, ["Default10"], ContentAuthenticator.DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })
})