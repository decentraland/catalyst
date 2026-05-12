import { IPointerManager } from '../../../../src/logic/pointer-manager'

export function buildNoOpPointerManager(): IPointerManager {
  return {
    referenceEntityFromPointers: jest.fn().mockResolvedValue(new Map())
  }
}
