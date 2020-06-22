import { Entity } from "../Entity";
import { Timestamp, EntityId } from "dcl-catalyst-commons";
import { Deployment } from "../deployments/DeploymentManager";

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
function happenedBeforeComparable(comparable1: EntityComparable, comparable2: EntityComparable): boolean {
    return comparable1.timestamp < comparable2.timestamp || (comparable1.timestamp == comparable2.timestamp && comparable1.entityId.toLowerCase() < comparable2.entityId.toLowerCase())
}

/** Return true if the first deployments happened before the second one */
export function happenedBefore(toBeComparable1: Deployment | Entity | EntityComparable, toBeComparable2: Deployment | Entity | EntityComparable): boolean {
    let comparable1: EntityComparable
    let comparable2: EntityComparable
    if ('auditInfo' in toBeComparable1) {
        comparable1 = { entityId: toBeComparable1.entityId, timestamp: toBeComparable1.entityTimestamp }
    } else if ('id' in toBeComparable1) {
        comparable1 = { entityId: toBeComparable1.id, timestamp: toBeComparable1.timestamp }
    } else {
        comparable1 = toBeComparable1
    }
    if ('auditInfo' in toBeComparable2) {
        comparable2 = { entityId: toBeComparable2.entityId, timestamp: toBeComparable2.entityTimestamp }
    } else if ('id' in toBeComparable2) {
        comparable2 = { entityId: toBeComparable2.id, timestamp: toBeComparable2.timestamp }
    } else {
        comparable2 = toBeComparable2
    }
    return happenedBeforeComparable(comparable1, comparable2)
}

function comparatorOldestToNewest(comparable1: EntityComparable, comparable2: EntityComparable) {
    return -1 * comparatorNewestToOldest(comparable1, comparable2)
}

function comparatorNewestToOldest(comparable1: EntityComparable, comparable2: EntityComparable) {
    if (comparable1.entityId == comparable2.entityId) {
        return 0
    } else if (happenedBeforeComparable(comparable2, comparable1)) {
        return -1
    } else {
        return 1
    }
}

type EntityComparable = {
    timestamp: Timestamp,
    entityId: EntityId,
}