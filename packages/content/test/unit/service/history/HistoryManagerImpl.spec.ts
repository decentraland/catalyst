import { random } from "faker"
import { HistoryStorage } from "@katalyst/content/service/history/HistoryStorage";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";
import { DeploymentEvent } from "@katalyst/content/service/history/HistoryManager";
import { EntityType, Entity } from "@katalyst/content/service/Entity";
import { MockedStorage } from "../../storage/MockedStorage";
import { HistoryManager } from "@katalyst/content/service/history/HistoryManager";
import { HistoryManagerImpl } from "@katalyst/content/service/history/HistoryManagerImpl";

describe("HistoryManager", () => {

    let storage: HistoryStorage
    let manager: HistoryManager

    beforeEach(async () => {
        storage = new HistoryStorage(new MockedStorage())
        manager = await HistoryManagerImpl.build(storage)
    })

    it(`When a deployment is reported, then it is stored on the temporary history`, async () => {
        const [{ entity: entity1, timestamp: timestamp1, event: event1 },
            { entity: entity2, timestamp: timestamp2, event: event2 }] = buildDeployments(2)
        const spy = spyOn(storage, "setTempHistory")

        await manager.newEntityDeployment(event1.serverName, entity1.type, entity1.id, timestamp1)
        expect(spy).toHaveBeenCalledWith([event1])

        await manager.newEntityDeployment(event2.serverName, entity2.type, entity2.id, timestamp2)
        expect(spy).toHaveBeenCalledWith([event2, event1])

        const history = await manager.getHistory();
        expect(history.events).toEqual([event2, event1])
    });

    it(`When time is set as immutable, then all deployments that happened before are stored as immutable`, async () => {
        const [{ entity: entity1, timestamp: timestamp1, event: event1 },
            { entity: entity2, timestamp: timestamp2, event: event2 },
            { entity: entity3, timestamp: timestamp3, event: event3 }] = buildDeployments(3)

        await manager.newEntityDeployment(event1.serverName, entity1.type, entity1.id, timestamp1)
        await manager.newEntityDeployment(event2.serverName, entity2.type, entity2.id, timestamp2)
        await manager.newEntityDeployment(event3.serverName, entity3.type, entity3.id, timestamp3)

        const tempSpy = spyOn(storage, "setTempHistory")
        const immutableSpy = spyOn(storage, "appendToImmutableHistory").and.callThrough()

        await manager.setTimeAsImmutable(timestamp1 + 1)
        expect(tempSpy).toHaveBeenCalledWith([event3, event2])
        expect(immutableSpy).toHaveBeenCalledWith([event1])

        await manager.setTimeAsImmutable(timestamp2 + 1)
        expect(tempSpy).toHaveBeenCalledWith([event3])
        expect(immutableSpy).toHaveBeenCalledWith([event2])

        const history = await manager.getHistory();
        expect(history.events).toEqual([event3, event2, event1])
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
        const serverName = random.alphaNumeric(20)
        const event =  {
            entityType: entity.type,
            entityId: entity.id,
            timestamp,
            serverName
        }
        return { entity, timestamp, event}
    }

    function getEntity(): Entity {
        return new Entity(random.alphaNumeric(10), EntityType.PROFILE, [], random.number())
    }

})
