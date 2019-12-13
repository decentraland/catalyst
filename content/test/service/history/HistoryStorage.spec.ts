import { random } from "faker"
import { HistoryStorage } from "../../../src/service/history/HistoryStorage";
import { Timestamp } from "../../../src/service/Service";
import { HistoryEvent, HistoryType, DeploymentEvent } from "../../../src/service/history/HistoryManager";
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

    function getRandomEvents(amount: number): HistoryEvent[] {
        return new Array(amount)
            .fill("")
            .map((_, index) => index % 2 === 0 ? HistoryType.DEPLOYMENT : HistoryType.SNAPSHOT)
            .map(createRandomEvent)
            .sort((a, b) => a.timestamp - b.timestamp)
    }

    function createRandomEvent(type: HistoryType): HistoryEvent {
        switch (type) {
            case HistoryType.DEPLOYMENT:
            case HistoryType.SNAPSHOT: // TODO: When we implement the snapshot, we should create a snapshot event
                return new DeploymentEvent(EntityType.SCENE, random.alphaNumeric(10), getRandomTimestamp())
        }
    }

    function getRandomTimestamp(): Timestamp {
        return random.number(1000000)
    }
})
