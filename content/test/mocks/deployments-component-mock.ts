import { IDeploymentsComponent } from '../../src/logic/deployments'

export const createDeploymentsComponentMock = (overrides?: Partial<jest.Mocked<IDeploymentsComponent>>) => {
  return {
    getDeploymentsForActiveThirdPartyItemsByEntityIds: jest.fn(),
    updateMaterializedViews: jest.fn(),
    ...overrides
  }
}
