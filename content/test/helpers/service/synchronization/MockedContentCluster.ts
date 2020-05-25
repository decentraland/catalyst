import { mock, when, instance } from "ts-mockito"
import { ContentCluster } from "@katalyst/content/service/synchronization/ContentCluster"

export class MockedContentCluster {

    static withRandomAddress(): ContentCluster {
        return this.withAddress('someAddress')
    }

    static withoutIdentity(): ContentCluster {
        let mockedCluster: ContentCluster = mock(ContentCluster)
        when(mockedCluster.getIdentityInDAO()).thenReturn(undefined)
        return instance(mockedCluster)
    }

    static withAddress(ethAddress: string): ContentCluster {
        let mockedCluster: ContentCluster = mock(ContentCluster)
        when(mockedCluster.getIdentityInDAO()).thenReturn({ owner: ethAddress, address: "", id: "", name: "" })
        return instance(mockedCluster)
    }

}