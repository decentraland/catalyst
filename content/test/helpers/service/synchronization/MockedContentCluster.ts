import { ContentCluster } from '@katalyst/content/service/synchronization/ContentCluster'
import { instance, mock, when } from 'ts-mockito'

export class MockedContentCluster {
  static withRandomAddress(): ContentCluster {
    return this.withAddress('someAddress')
  }

  static withoutIdentity(): ContentCluster {
    const mockedCluster: ContentCluster = mock(ContentCluster)
    when(mockedCluster.getIdentityInDAO()).thenReturn(undefined)
    return instance(mockedCluster)
  }

  static withAddress(ethAddress: string): ContentCluster {
    const mockedCluster: ContentCluster = mock(ContentCluster)
    when(mockedCluster.getIdentityInDAO()).thenReturn({ owner: ethAddress, address: '', id: '' })
    return instance(mockedCluster)
  }

  static withName(name: string): ContentCluster {
    const mockedCluster: ContentCluster = mock(ContentCluster)
    when(mockedCluster.getIdentityInDAO()).thenReturn({ owner: '', address: '', id: '' })
    return instance(mockedCluster)
  }
}
