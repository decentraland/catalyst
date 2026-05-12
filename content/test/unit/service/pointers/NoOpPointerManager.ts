import { IPointerManager } from '../../../../src/logic/pointer-manager'

export class NoOpPointerManager {
  static build(): IPointerManager {
    return {
      referenceEntityFromPointers: jest.fn().mockResolvedValue(new Map())
    }
  }
}
