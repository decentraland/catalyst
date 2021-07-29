import { Entity as ControllerEntity, EntityContentItemReference } from 'dcl-catalyst-commons'
import { Deployment } from '../service/deployments/DeploymentManager'
import { Entity } from '../service/Entity'
import { EntityField } from './Controller'

export class ControllerEntityFactory {
  static maskEntity(fullEntity: Entity, fields?: EntityField[]): ControllerEntity {
    const { id, type, timestamp, version } = fullEntity
    let content: EntityContentItemReference[] | undefined = undefined
    let metadata: any
    let pointers: string[] = []
    if ((!fields || fields.includes(EntityField.CONTENT)) && fullEntity.content) {
      content = Array.from(fullEntity.content.entries()).map(([file, hash]) => ({ file, hash }))
    }
    if (!fields || fields.includes(EntityField.METADATA)) {
      metadata = fullEntity.metadata
    }
    if ((!fields || fields.includes(EntityField.POINTERS)) && fullEntity.pointers) {
      pointers = fullEntity.pointers
    }
    return { version, id, type, timestamp, pointers, content, metadata }
  }

  static maskDeployment(fullDeployment: Deployment, fields?: EntityField[]): ControllerEntity {
    const entity: Entity = {
      ...fullDeployment,
      version: fullDeployment.entityVersion,
      id: fullDeployment.entityId,
      timestamp: fullDeployment.entityTimestamp,
      type: fullDeployment.entityType
    }
    return this.maskEntity(entity, fields)
  }
}
