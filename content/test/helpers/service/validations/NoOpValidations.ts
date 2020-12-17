import { ValidatorInstance } from '@katalyst/content/service/validations/Validations'
import { instance, mock, when } from 'ts-mockito'

export class NoOpValidations {
  getInstance(): ValidatorInstance {
    const mockedValidatorInstance: ValidatorInstance = mock(ValidatorInstance)
    when(mockedValidatorInstance.getErrors()).thenReturn([])
    return instance(mockedValidatorInstance)
  }
}
