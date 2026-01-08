import { PointerManager } from '../../../../src/service/pointers/PointerManager'

export class NoOpPointerManager {
  static build(): jest.Mocked<PointerManager> {
    return {
      referenceEntityFromPointers: jest.fn().mockResolvedValue(new Map())
    } as unknown as jest.Mocked<PointerManager>
  }
}
