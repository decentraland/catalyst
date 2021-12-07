import { EntityType, ServerBaseUrl, Timestamp } from 'dcl-catalyst-commons'
import { Database } from '../../repository/Database'
import { Repository } from '../../repository/Repository'
import { DB_REQUEST_PRIORITY } from '../../repository/RepositoryQueue'
import { SnapshotMetadata } from '../snapshots/SnapshotManager'
import { IntPropertyMapper, JSONPropertyMapper, SystemPropertyMapper } from './SystemPropertyMappers'

export class SystemProperty<PropertyType> {
  static readonly LAST_KNOWN_LOCAL_DEPLOYMENTS: SystemProperty<[ServerBaseUrl, Timestamp][]> = new SystemProperty(
    'last_known_local_deployments',
    new JSONPropertyMapper()
  )
  static readonly LAST_FULL_SNAPSHOTS_PER_ENTITY: SystemProperty<[EntityType, SnapshotMetadata][]> = new SystemProperty(
    'last_full_snapshot_per_entity',
    new JSONPropertyMapper()
  )
  static readonly LAST_GARBAGE_COLLECTION_TIME: SystemProperty<Timestamp> = new SystemProperty(
    'last_garbage_collection_time',
    new IntPropertyMapper()
  )

  constructor(private readonly name: string, private readonly mapper: SystemPropertyMapper<PropertyType>) {}

  getName(): string {
    return this.name
  }

  getMapper(): SystemPropertyMapper<PropertyType> {
    return this.mapper
  }
}

export class SystemPropertiesManager {
  constructor(private readonly repository: Repository) {}

  async getSystemProperty<T>(property: SystemProperty<T>, task?: Database): Promise<T | undefined> {
    const stringValue = await this.repository.reuseIfPresent(
      task,
      (db) => db.systemProperties.getProperty(property.getName()),
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
    return stringValue ? property.getMapper().fromString(stringValue) : undefined
  }

  setSystemProperty<T>(property: SystemProperty<T>, value: T, task?: Database) {
    const stringValue = property.getMapper().toString(value)
    return this.repository.reuseIfPresent(
      task,
      (db) => db.systemProperties.setProperty(property.getName(), stringValue),
      { priority: DB_REQUEST_PRIORITY.HIGH }
    )
  }
}
