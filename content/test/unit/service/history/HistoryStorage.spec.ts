import { random } from "faker"
import { HistoryStorage } from "@katalyst/content/src/service/history/HistoryStorage";
import { Timestamp } from "@katalyst/content/src/service/Service";
import { DeploymentEvent, DeploymentHistory } from "@katalyst/content/src/service/history/HistoryManager";
import { EntityType } from "@katalyst/content/src/service/Entity";
import { MockedStorage } from "../../storage/MockedStorage";

describe("HistoryStorage", () => {

    let storage: HistoryStorage

    beforeEach(() => {
        storage = new HistoryStorage(new MockedStorage())
    })

    it(`When temp history is stored, it can be retrieved`, async () => {
        const history = getRandomEvents(5)

        await storage.setTempHistory(history)

        expect(await storage.getTempHistory()).toEqual(history)
    });

    it(`When temp history is stored twice, it is overwriten`, async () => {
        const history1 = getRandomEvents(5)
        const history2 = getRandomEvents(6)

        await storage.setTempHistory(history1)
        await storage.setTempHistory(history2)

        expect(await storage.getTempHistory()).toEqual(history2)
    });

    it(`When immutable history is stored, it can be retrieved`, async () => {
        const history = getRandomEvents(5)

        await storage.appendToImmutableHistory(history)

        expect(await storage.getImmutableHistory()).toEqual(history)
    });

    it(`When immutable history is stored twice, it is appended`, async () => {
        const history1 = getRandomEvents(5)
        const history2 = getRandomEvents(6)

        await storage.appendToImmutableHistory(history1)
        await storage.appendToImmutableHistory(history2)

        expect(await storage.getImmutableHistory()).toEqual(history1.concat(history2))
    });

    /** Returns a DeploymentHistory, sorted from oldest to newest */
    function getRandomEvents(amount: number): DeploymentHistory {
        return new Array(amount)
            .fill("")
            .map(createRandomEvent)
            .sort((a, b) => a.timestamp - b.timestamp)
    }

    function createRandomEvent(): DeploymentEvent {
        return {
            entityType: EntityType.SCENE,
            entityId: random.alphaNumeric(10),
            timestamp: getRandomTimestamp(),
            serverName: random.alphaNumeric(20),
        }
    }

    function getRandomTimestamp(): Timestamp {
        return random.number(1000000)
    }
})
