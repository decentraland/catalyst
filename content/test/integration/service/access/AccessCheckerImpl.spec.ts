import { EntityType, Fetcher } from "dcl-catalyst-commons";
import { AccessCheckerImpl } from "@katalyst/content/service/access/AccessCheckerImpl";
import { ContentAuthenticator } from "@katalyst/content/service/auth/Authenticator";
import { DEFAULT_DCL_PARCEL_ACCESS_URL_ROPSTEN } from "@katalyst/content/Environment";

describe("Integration - AccessCheckerImpl", function () {

    it(`When access URL is wrong it reports an error`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(), new Fetcher(), "Wrong URL");

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["102,4"], Date.now(), "Some-address-without-permissions");

        expect(errors.length).toBe(1)
        expect(errors[0]).toEqual("The provided Eth Address does not have access to the following parcel: (102,4)")
    })

    it(`When an address without permissions tries to deploy it fails`, async () => {
        const accessChecker = new AccessCheckerImpl(new ContentAuthenticator(),new Fetcher(), DEFAULT_DCL_PARCEL_ACCESS_URL_ROPSTEN);

        const errors = await accessChecker.hasAccess(EntityType.SCENE, ["102,4"], Date.now(), "Some-address-without-permissions");

        expect(errors.length).toBe(1)
        expect(errors[0]).toEqual("The provided Eth Address does not have access to the following parcel: (102,4)")
    })

})