import { ContentCluster } from '../../../../src/service/synchronization/ContentCluster'

export class MockedContentCluster {
  static withAddress(ethAddress: string): jest.Mocked<ContentCluster> {
    return {
      getIdentity: jest.fn().mockResolvedValue({ owner: ethAddress, address: '', id: '0' })
    } as unknown as jest.Mocked<ContentCluster>
  }
}
