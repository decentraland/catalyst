import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl";
import { EntityType } from "@katalyst/content/service/Entity";
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator";
import { DEFAULT_DCL_PARCEL_ACCESS_URL } from "@katalyst/content/Environment";

describe("AccessCheckerImpl", function () {

    it(`When a non-decentraland address tries to deploy an default scene, then an error is returned`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url');

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], Date.now(), "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default scenes")
    })

    it(`When a decentraland address tries to deploy an default scene, then it is allowed`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url');

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], Date.now(), ContentAuthenticator.DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })

    it(`When a non-decentraland address tries to deploy an default profile, then an error is returned`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url');

        const errors = await accessChecker.hasAccess(EntityType.PROFILE, ["Default10"], Date.now(), "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default profiles")
    })

    it(`When a decentraland address tries to deploy an default profile, then it is allowed`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), 'unused_url');

        const errors = await accessChecker.hasAccess(EntityType.PROFILE, ["Default10"], Date.now(), ContentAuthenticator.DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })

    it(`When an address without permissions tries to deploy it fails`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), DEFAULT_DCL_PARCEL_ACCESS_URL);

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["102,4"], Date.now(), "Some-address-without-permissions");

        expect(errors.length).toBe(1)
        expect(errors[0]).toEqual("The provided Eth Address does not have access to the following parcel: (102,4)")
    })

})