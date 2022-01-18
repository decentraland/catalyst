import { instance, mock, when } from 'ts-mockito'
import { ContentCluster } from '../../../../src/service/synchronization/ContentCluster'

export class MockedContentCluster {
  static withAddress(ethAddress: string): ContentCluster {
    const mockedCluster: ContentCluster = mock(ContentCluster)
    when(mockedCluster.getIdentity()).thenResolve({ owner: ethAddress, baseUrl: '', id: '' })
    return instance(mockedCluster)
  }
}
