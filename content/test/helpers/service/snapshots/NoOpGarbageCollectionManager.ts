import { instance, mock, when } from 'ts-mockito'
import { SnapshotManager } from '../../../../src/service/snapshots/SnapshotManager'

export class NoOpSnapshotManager {
  static build(): SnapshotManager {
    const mockedManager: SnapshotManager = mock(SnapshotManager)
    when(mockedManager.startSnapshotsPerEntity()).thenReturn(Promise.resolve())
    return instance(mockedManager)
  }
}
