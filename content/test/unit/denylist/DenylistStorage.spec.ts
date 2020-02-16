import { random } from "faker"
import { MockedStorage } from "../storage/MockedStorage";
import { DenylistStorage } from "@katalyst/content/denylist/DenylistStorage";
import { buildContentTarget } from "@katalyst/content/denylist/DenylistTarget";
import { DenylistMetadata } from "@katalyst/content/denylist/Denylist";

describe("DenylistStorage", () => {

    let storage: DenylistStorage

    beforeEach(async () => {
        storage = new DenylistStorage(new MockedStorage())
    })

    it(`When target is denylisted, then it is reported as denylisted`, async () => {
        const target = buildContentTarget(random.alphaNumeric(10))
        const metadata = someMetadata();

        let areDenylisted = await storage.areTargetsDenylisted([target]);
        let denylists = await storage.getAllDenylists()

        expect(areDenylisted.size).toBe(1)
        expect(areDenylisted.get(target)).toBe(false)
        expect(denylists.size).toBe(0)

        await storage.addDenylist(target, metadata)
        areDenylisted = await storage.areTargetsDenylisted([target]);
        denylists = await storage.getAllDenylists()

        expect(areDenylisted.size).toBe(1)
        expect(areDenylisted.get(target)).toBe(true)
        expect(denylists.size).toBe(1)
        expect(Array.from(denylists.keys()).map(target => target.asString())).toContain(target.asString())
        expect(Array.from(denylists.values())).toContain(metadata)
    })

    it(`When target is un-denylisted, then it is no longer reported as denylisted`, async () => {
        const target = buildContentTarget(random.alphaNumeric(10))
        const metadata = someMetadata();

        await storage.addDenylist(target, metadata)
        await storage.removeDenylist(target)

        let areDenylisted = await storage.areTargetsDenylisted([target]);
        let denylists = await storage.getAllDenylists()

        expect(areDenylisted.size).toBe(1)
        expect(areDenylisted.get(target)).toBe(false)
        expect(denylists.size).toBe(0)
    })

    function someMetadata(): DenylistMetadata {
        return {
            blocker: random.alphaNumeric(20),
            timestamp: random.number(10),
            signature: random.alphaNumeric(15),
        }
    }

})
