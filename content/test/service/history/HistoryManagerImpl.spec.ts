import { random } from "faker"
import { HistoryStorage } from "../../../src/service/history/HistoryStorage";
import { Timestamp } from "../../../src/service/Service";
import { DeploymentEvent } from "../../../src/service/history/HistoryManager";
import { EntityType, Entity } from "../../../src/service/Entity";
import { MockedStorage } from "../../storage/MockedStorage";
import { HistoryManagerImpl } from "../../../src/service/history/HistoryManagerImpl";

describe("HistoryManager", function() {

    beforeEach(function() {
        this.storage = new HistoryStorage(new MockedStorage())
        this.manager = new HistoryManagerImpl(this.storage)
    })

    it(`When a deployment is reported, then it is stored on the temporary history`, async function() {
        const [{ entity: entity1, timestamp: timestamp1, event: event1 },
            { entity: entity2, timestamp: timestamp2, event: event2 }] = buildDeployments(2)
        const spy = spyOn(this.storage, "setTempHistory")

        await this.manager.newEntityDeployment(entity1, timestamp1)
        expect(spy).toHaveBeenCalledWith([event1])

        await this.manager.newEntityDeployment(entity2, timestamp2)
        expect(spy).toHaveBeenCalledWith([event2, event1])

        const history = await this.manager.getHistory();
        expect(history).toEqual([event2, event1])
    });

    it(`When time is set as immutable, then all deployments that happened before are stored as immutable`, async function() {
        const [{ entity: entity1, timestamp: timestamp1, event: event1 },
            { entity: entity2, timestamp: timestamp2, event: event2 },
            { entity: entity3, timestamp: timestamp3, event: event3 }] = buildDeployments(3)

        await this.manager.newEntityDeployment(entity1, timestamp1)
        await this.manager.newEntityDeployment(entity2, timestamp2)
        await this.manager.newEntityDeployment(entity3, timestamp3)

        const tempSpy = spyOn(this.storage, "setTempHistory")
        const immutableSpy = spyOn(this.storage, "appendToImmutableHistory").and.callThrough()

        await this.manager.setTimeAsImmutable(timestamp1)
        expect(tempSpy).toHaveBeenCalledWith([event3, event2])
        expect(immutableSpy).toHaveBeenCalledWith([event1])

        await this.manager.setTimeAsImmutable(timestamp2)
        expect(tempSpy).toHaveBeenCalledWith([event3])
        expect(immutableSpy).toHaveBeenCalledWith([event2])

        const history = await this.manager.getHistory();
        expect(history).toEqual([event3, event2, event1])
    });

    type Deployment = {
        entity: Entity,
        timestamp: Timestamp,
        event: DeploymentEvent
    }

    /** Returns a list of deployments, sorted from oldest to newest */
    function buildDeployments(amount): Deployment[] {
        return new Array(amount)
        .fill("")
        .map(buildRandomDeployment)
        .sort((a, b) => a.timestamp - b.timestamp)
    }

    function buildRandomDeployment(): Deployment {
        const entity = getEntity()
        const timestamp = random.number()
        const event =  {
            entityType: entity.type,
            entityId: entity.id,
            timestamp
        }
        return { entity, timestamp, event}
    }

    function getEntity(): Entity {
        return new Entity(random.alphaNumeric(10), EntityType.PROFILE, [], random.number())
    }

})
