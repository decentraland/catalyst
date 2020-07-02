import { mock, instance, when } from "ts-mockito"
import { SnapshotManager } from "@katalyst/content/service/snapshots/SnapshotManager"

export class NoOpSnapshotManager {

    static build(): SnapshotManager {
        const mockedManager: SnapshotManager = mock(SnapshotManager)
        when(mockedManager.start()).thenReturn(Promise.resolve())
        return instance(mockedManager)
    }
}