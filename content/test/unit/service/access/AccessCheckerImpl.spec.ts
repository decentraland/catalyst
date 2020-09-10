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

    it(`When a non-decentraland address tries to deploy an default wearable, then an error is returned`, async () => {
        const accessChecker = buildAccessChecker()

        const errors = await accessChecker.hasAccess(EntityType.WEARABLE, ["Default-0"], Date.now(), "0xAddress");

        expect(errors).toContain("Only Decentraland can add or modify default wearables")
    })

    it(`When a decentraland address tries to deploy an default wearable, then it is allowed`, async () => {
        const accessChecker = buildAccessChecker();

        const errors = await accessChecker.hasAccess(EntityType.WEARABLE, ["Default-0"], Date.now(), DECENTRALAND_ADDRESS);

        expect(errors.length).toBe(0)
    })

    it(`Invalid Wearables pointers are reported as errors`, async () => {
        const accessChecker = buildAccessChecker();

        const errors = await accessChecker.hasAccess(EntityType.WEARABLE, ["Invalid_pointer"], Date.now(), "Unused Address");

        expect(errors).toContain("Wearable pointers should only contain the collection id and the item id separated by a hyphen, for example (0xd148b172f8f64b7a42854447fbc528f41aa2258e-0). Invalid pointer: (invalid_pointer)")
    })

    it(`Invalid Wearables pointers are reported as errors`, async () => {
        const accessChecker = buildAccessChecker();

        const errors = await accessChecker.hasAccess(EntityType.WEARABLE, ["Invalid_pointer-"], Date.now(), "Unused Address");

        expect(errors).toContain("Wearable pointers must contain the collection id and the item id separated by a hyphen, for example (0xd148b172f8f64b7a42854447fbc528f41aa2258e-0). Invalid pointer: (invalid_pointer-)")
    })

    function buildAccessChecker() {
        return new AccessCheckerImpl(new ContentAuthenticator(), new Fetcher(), 'unused_url', 'unused_url');
    }

})