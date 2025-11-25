import { IDeploymentsComponent } from '../../src/logic/deployments'

export const createDeploymentsComponentMock = (overrides?: Partial<jest.Mocked<IDeploymentsComponent>>) => {
  return {
    getDeploymentsForActiveThirdPartyCollectionItems: jest.fn(),
    getDeploymentsForActiveThirdPartyCollectionItemsByEntityIds: jest.fn(),
    updateMaterializedViews: jest.fn(),
    ...overrides
  }
}
