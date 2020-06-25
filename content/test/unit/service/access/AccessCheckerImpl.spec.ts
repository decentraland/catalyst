import { EntityType, Fetcher } from "dcl-catalyst-commons";
import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl";
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator";
import { DECENTRALAND_ADDRESS } from "decentraland-katalyst-commons/addresses";

describe("AccessCheckerImpl", function () {

    it(`When a non-decentraland address tries to deploy an default scene, then an error is returned`, async () => {
        const accessChecker = buildAccessChecker()

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], Date.now(), "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default scenes")
    })

    it(`When a decentraland address tries to deploy an default scene, then it is allowed`, async () => {
        const accessChecker = buildAccessChecker()

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], Date.now(), DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })

    it(`When a non-decentraland address tries to deploy an default profile, then an error is returned`, async () => {
        const accessChecker = buildAccessChecker()

        const errors = await accessChecker.hasAccess(EntityType.PROFILE, ["Default10"], Date.now(), "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default profiles")
    })

    it(`When a decentraland address tries to deploy an default profile, then it is allowed`, async () => {
        const accessChecker = buildAccessChecker();

        const errors = await accessChecker.hasAccess(EntityType.PROFILE, ["Default10"], Date.now(), DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })

    function buildAccessChecker() {
        return new AccessCheckerImpl(new ContentAuthenticator(), new Fetcher(), 'unused_url');
    }

})