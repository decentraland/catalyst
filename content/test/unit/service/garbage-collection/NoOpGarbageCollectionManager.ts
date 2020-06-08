import { mock, instance } from "ts-mockito"
import { GarbageCollectionManager } from "@katalyst/content/service/garbage-collection/GarbageCollectionManager"

export class NoOpGarbageCollectionManager {

    static build(): GarbageCollectionManager {
        const mockedManager: GarbageCollectionManager = mock(GarbageCollectionManager)
        return instance(mockedManager)
    }
}