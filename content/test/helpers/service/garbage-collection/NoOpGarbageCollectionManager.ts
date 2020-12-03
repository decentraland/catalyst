import { mock, instance, when } from 'ts-mockito'
import { GarbageCollectionManager } from '@katalyst/content/service/garbage-collection/GarbageCollectionManager'

export class NoOpGarbageCollectionManager {
  static build(): GarbageCollectionManager {
    const mockedManager: GarbageCollectionManager = mock(GarbageCollectionManager)
    when(mockedManager.start()).thenReturn(Promise.resolve())
    when(mockedManager.stop()).thenReturn(Promise.resolve())
    return instance(mockedManager)
  }
}
