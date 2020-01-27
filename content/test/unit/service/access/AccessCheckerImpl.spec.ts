import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl";
import { EntityType } from "@katalyst/content/service/Entity";
import { Authenticator } from "@katalyst/content/service/auth/Authenticator";

describe("AccessCheckerImpl", function () {

    it(`When a non-decentraland address tries to deploy an default entity, then an error is returned`, async () => {
        const accessChecker = new AccessCheckerImpl();

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default scenes")
    })

    it(`When a decentraland address tries to deploy an default entity, then it is allowed`, async () => {
        const accessChecker = new AccessCheckerImpl();

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["Default10"], Authenticator.DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })
})