import { Environment } from '../Environment'
import { LambdasService } from './Service'
import { ServiceImpl } from './ServiceImpl'

export class ServiceFactory {
  static create(env: Environment): LambdasService {
    return new ServiceImpl(env)
  }
}
