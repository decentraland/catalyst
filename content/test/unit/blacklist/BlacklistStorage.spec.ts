import { random } from "faker"
import { MockedStorage } from "../storage/MockedStorage";
import { BlacklistStorage } from "@katalyst/content/blacklist/BlacklistStorage";
import { buildContentTarget } from "@katalyst/content/blacklist/BlacklistTarget";
import { BlacklistMetadata } from "@katalyst/content/blacklist/Blacklist";

describe("BlacklistStorage", () => {

    let storage: BlacklistStorage

    beforeEach(async () => {
        storage = new BlacklistStorage(new MockedStorage())
    })

    it(`When target is blacklisted, then it is reported as blacklisted`, async () => {
        const target = buildContentTarget(random.alphaNumeric(10))
        const metadata = someMetadata();

        let areBlacklisted = await storage.areTargetsBlacklisted([target]);
        let blacklists = await storage.getAllBlacklists()

        expect(areBlacklisted.size).toBe(1)
        expect(areBlacklisted.get(target)).toBe(false)
        expect(blacklists.size).toBe(0)

        await storage.addBlacklist(target, metadata)
        areBlacklisted = await storage.areTargetsBlacklisted([target]);
        blacklists = await storage.getAllBlacklists()

        expect(areBlacklisted.size).toBe(1)
        expect(areBlacklisted.get(target)).toBe(true)
        expect(blacklists.size).toBe(1)
        expect(Array.from(blacklists.keys()).map(target => target.asString())).toContain(target.asString())
        expect(Array.from(blacklists.values())).toContain(metadata)
    })

    it(`When target is un-blacklisted, then it is no longer reported as blacklisted`, async () => {
        const target = buildContentTarget(random.alphaNumeric(10))
        const metadata = someMetadata();

        await storage.addBlacklist(target, metadata)
        await storage.removeBlacklist(target)

        let areBlacklisted = await storage.areTargetsBlacklisted([target]);
        let blacklists = await storage.getAllBlacklists()

        expect(areBlacklisted.size).toBe(1)
        expect(areBlacklisted.get(target)).toBe(false)
        expect(blacklists.size).toBe(0)
    })

    function someMetadata(): BlacklistMetadata {
        return {
            blocker: random.alphaNumeric(20),
            timestamp: random.number(10),
            signature: random.alphaNumeric(15),
        }
    }

})
