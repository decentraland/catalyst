import { instance, mock, when } from 'ts-mockito'
import { ContentCluster } from '../../../../src/service/synchronization/ContentCluster'

export class MockedContentCluster {
  static withAddress(ethAddress: string): ContentCluster {
    const mockedCluster: ContentCluster = mock(ContentCluster)
    when(mockedCluster.getIdentity()).thenResolve({ owner: ethAddress, address: '', id: '0' })
    return instance(mockedCluster)
  }
}
