import { PointerManager } from '@katalyst/content/service/pointers/PointerManager'
import { anything, instance, mock, when } from 'ts-mockito'

export class NoOpPointerManager {
  static build(): PointerManager {
    const mockedManager: PointerManager = mock(PointerManager)
    when(mockedManager.calculateOverwrites(anything(), anything())).thenReturn(
      Promise.resolve({ overwrote: new Set(), overwrittenBy: null })
    )
    return instance(mockedManager)
  }
}
