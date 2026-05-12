import { IPointerManager } from '../../src/logic/pointer-manager'

export function createNoOpPointerManager(): IPointerManager {
  return {
    referenceEntityFromPointers: jest.fn().mockResolvedValue(new Map())
  }
}
