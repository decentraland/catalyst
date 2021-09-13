import { anything, instance, mock, when } from 'ts-mockito'
import { PointerManager } from '../../../../src/service/pointers/PointerManager'

export class NoOpPointerManager {
  static build(): PointerManager {
    const mockedManager: PointerManager = mock(PointerManager)
    when(mockedManager.calculateOverwrites(anything(), anything())).thenResolve({
      overwrote: new Set(),
      overwrittenBy: null
    })
    when(mockedManager.referenceEntityFromPointers(anything(), anything(), anything())).thenResolve(new Map())

    return instance(mockedManager)
  }
}
