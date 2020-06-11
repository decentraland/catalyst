import { Entity } from "../Entity";
import { Timestamp, EntityId } from "dcl-catalyst-commons";

/** Sort comparable objects from oldest to newest */
export function sortNonComparableFromOldestToNewest<T extends { entityId: EntityId }> (array: T[], timestampExtraction: (element: T) => Timestamp): T[] {
    return array.map<[EntityComparable, T]>(element => [{...element, timestamp: timestampExtraction(element)}, element])
        .sort(([comparable1], [comparable2]) => comparatorOldestToNewest(comparable1, comparable2))
        .map(([, element]) => element)
}

/** Sort comparable objects from oldest to newest */
export function sortFromOldestToNewest<T extends EntityComparable> (comparableArray: T[]): T[] {
    return comparableArray.sort((event1, event2) => comparatorOldestToNewest(event1, event2))
}

/** Return true if the first object happened before the second one */
export function happenedBefore(comparable1: EntityComparable, comparable2: EntityComparable): boolean {
    return comparable1.timestamp < comparable2.timestamp || (comparable1.timestamp == comparable2.timestamp && comparable1.entityId.toLowerCase() < comparable2.entityId.toLowerCase())
}

/** Return true if the first entity was created happened before the second one */
export function happenedBeforeEntities(entity1: Entity, entity2: Entity): boolean {
    const comparable1 = { entityId: entity1.id, timestamp: entity1.timestamp }
    const comparable2 = { entityId: entity2.id, timestamp: entity2.timestamp }
    return happenedBefore(comparable1, comparable2)
}

function comparatorOldestToNewest(comparable1: EntityComparable, comparable2: EntityComparable) {
    return -1 * comparatorNewestToOldest(comparable1, comparable2)
}

function comparatorNewestToOldest(comparable1: EntityComparable, comparable2: EntityComparable) {
    if (comparable1.entityId == comparable2.entityId) {
        return 0
    } else if (happenedBefore(comparable2, comparable1)) {
        return -1
    } else {
        return 1
    }
}

type EntityComparable = {
    timestamp: Timestamp,
    entityId: EntityId,
}