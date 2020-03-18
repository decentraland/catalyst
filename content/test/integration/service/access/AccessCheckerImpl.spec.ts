import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl";
import { EntityType } from "@katalyst/content/service/Entity";
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator";

describe("AccessCheckerImpl", function () {

    it(`Integration - When access URL is wrong it reports an error`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), "Wrong URL");

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["102,4"], Date.now(), "Some-address-without-permissions");

        expect(errors.length).toBe(1)
        expect(errors[0]).toEqual("The provided Eth Address does not have access to the following parcel: (102,4)")
    })

})