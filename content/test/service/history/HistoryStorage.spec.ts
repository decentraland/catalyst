import { random } from "faker"
import { HistoryStorage } from "../../../src/service/history/HistoryStorage";
import { Timestamp } from "../../../src/service/Service";
import { DeploymentEvent, DeploymentHistory } from "../../../src/service/history/HistoryManager";
import { EntityType } from "../../../src/service/Entity";
import { MockedStorage } from "../../../test/storage/MockedStorage";

describe("HistoryStorage", function() {

    beforeEach(function() {
        this.storage = new HistoryStorage(new MockedStorage())
    })

    it(`When temp history is stored, it can be retrieved`, async function() {
        const history = getRandomEvents(5)

        this.storage.setTempHistory(history)

        expect(await this.storage.getTempHistory()).toEqual(history)
    });

    it(`When temp history is stored twice, it is overwriten`, async function() {
        const history1 = getRandomEvents(5)
        const history2 = getRandomEvents(6)

        this.storage.setTempHistory(history1)
        this.storage.setTempHistory(history2)

        expect(await this.storage.getTempHistory()).toEqual(history2)
    });

    it(`When immutable history is stored, it can be retrieved`, async function() {
        const history = getRandomEvents(5)

        this.storage.appendToImmutableHistory(history)

        expect(await this.storage.getImmutableHistory()).toEqual(history)
    });

    it(`When immutable history is stored twice, it is appended`, async function() {
        const history1 = getRandomEvents(5)
        const history2 = getRandomEvents(6)

        this.storage.appendToImmutableHistory(history1)
        this.storage.appendToImmutableHistory(history2)

        expect(await this.storage.getImmutableHistory()).toEqual(history1.concat(history2))
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
        }
    }

    function getRandomTimestamp(): Timestamp {
        return random.number(1000000)
    }
})
