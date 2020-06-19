import { Timestamp, ServerAddress } from "dcl-catalyst-commons";
import { Repository, RepositoryTask } from "@katalyst/content/storage/Repository";
import { IntPropertyMapper, SystemPropertyMapper, JSONPropertyMapper } from "./SystemPropertyMappers";

export class SystemProperty<PropertyType> {

    static readonly LAST_KNOWN_LOCAL_DEPLOYMENTS: SystemProperty<[ServerAddress, Timestamp][] > = new SystemProperty('last_known_local_deployments', new JSONPropertyMapper())
    static readonly LAST_GARBAGE_COLLECTION_TIME: SystemProperty<Timestamp> = new SystemProperty('last_garbage_collection_time', new IntPropertyMapper())

    constructor(
        private readonly name: string,
        private readonly mapper: SystemPropertyMapper<PropertyType>) { }

    getName(): string {
        return this.name
    }

    getMapper(): SystemPropertyMapper<PropertyType> {
        return this.mapper
    }

}

export class SystemPropertiesManager {

    constructor(private readonly repository: Repository) { }

    async getSystemProperty<T>(property: SystemProperty<T>, repository: RepositoryTask | Repository = this.repository): Promise<T | undefined> {
        const stringValue = await repository.systemProperties.getProperty(property.getName())
        return stringValue ? property.getMapper().fromString(stringValue) : undefined
    }

    setSystemProperty<T>(property: SystemProperty<T>, value: T, repository: RepositoryTask | Repository = this.repository) {
        const stringValue = property.getMapper().toString(value)
        return repository.systemProperties.setProperty(property.getName(), stringValue)
    }

}