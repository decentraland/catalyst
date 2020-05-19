import { mock, when, instance } from "ts-mockito";
import { ValidatorInstance } from "@katalyst/content/service/validations/Validations";


export class NoOpValidations {

    getInstance(): ValidatorInstance {
        const mockedValidatorInstance: ValidatorInstance = mock(ValidatorInstance)
        when(mockedValidatorInstance.getErrors()).thenReturn([])
        return instance(mockedValidatorInstance)
    }
}