import Ajv from 'ajv'
import ajv_errors from 'ajv-errors'

export const ajv = new Ajv({ $data: true, allErrors: true })
ajv_errors(ajv, { singleError: true })
