import { Repository } from "@katalyst/content/storage/Repository";
import { mock, when, instance, anything } from "ts-mockito";

export class MockedRepository {

    static build() {
        const mockedRepository: Repository = mock<Repository>()
        when(mockedRepository.task(anything())).thenCall(call => call(mockedRepository))
        when(mockedRepository.taskIf(anything())).thenCall(call => call(mockedRepository))
        when(mockedRepository.tx(anything())).thenCall(call => call(mockedRepository))
        when(mockedRepository.txIf(anything())).thenCall(call => call(mockedRepository))
        return instance(mockedRepository)
    }

}