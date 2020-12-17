import { SnapshotManager } from '@katalyst/content/service/snapshots/SnapshotManager'
import { instance, mock, when } from 'ts-mockito'

export class NoOpSnapshotManager {
  static build(): SnapshotManager {
    const mockedManager: SnapshotManager = mock(SnapshotManager)
    when(mockedManager.start()).thenReturn(Promise.resolve())
    return instance(mockedManager)
  }
}
