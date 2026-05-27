import { IContentStorageComponent } from '@dcl/catalyst-storage'

export const createStorageComponentMock = (
  overrides?: Partial<IContentStorageComponent>
): IContentStorageComponent => {
  return {
    storeStream: jest.fn(),
    storeStreamAndCompress: jest.fn(),
    delete: jest.fn(),
    retrieve: jest.fn(),
    fileInfo: jest.fn(),
    fileInfoMultiple: jest.fn(),
    exist: jest.fn(),
    existMultiple: jest.fn(),
    allFileIds: jest.fn(),
    ...overrides
  }
}
