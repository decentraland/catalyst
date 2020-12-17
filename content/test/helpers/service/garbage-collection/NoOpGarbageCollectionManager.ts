import { GarbageCollectionManager } from '@katalyst/content/service/garbage-collection/GarbageCollectionManager'
import { instance, mock, when } from 'ts-mockito'

export class NoOpGarbageCollectionManager {
  static build(): GarbageCollectionManager {
    const mockedManager: GarbageCollectionManager = mock(GarbageCollectionManager)
    when(mockedManager.start()).thenReturn(Promise.resolve())
    when(mockedManager.stop()).thenReturn(Promise.resolve())
    return instance(mockedManager)
  }
}
