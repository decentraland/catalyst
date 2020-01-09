import { EntityId } from "../Entity";

/** Sort comparable objects from oldest to newest */
export function sortFromOldestToNewest<T extends EntityComparable> (comparableArray: T[]): T[] {
    return comparableArray.sort((event1, event2) => comparatorOldestToNewest(event1, event2))
}

/** Sort comparable objects from newest to oldest */
export function sortFromNewestToOldest<T extends EntityComparable> (comparableArray: T[]): T[] {
    return comparableArray.sort((event1, event2) => comparatorNewestToOldest(event1, event2))
}

/** Return true if the first object happened before the second one */
export function happenedBefore(comparable1: EntityComparable, comparable2: EntityComparable): boolean {
    return comparable1.timestamp < comparable2.timestamp || (comparable1.timestamp == comparable2.timestamp && comparable1.entityId < comparable2.entityId)
}

/** Return true if the first object happened before the given time */
export function happenedBeforeTime(comparable: EntityComparable, timestamp: Timestamp): boolean {
    return comparable.timestamp < timestamp
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

export type Timestamp = number

type EntityComparable = {
    timestamp: Timestamp,
    entityId: EntityId,
}