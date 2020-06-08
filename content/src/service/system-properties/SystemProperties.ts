import { Repository, RepositoryTask } from "@katalyst/content/storage/Repository";
import { Timestamp } from "../time/TimeSorting";
import { StringPropertyMapper, IntPropertyMapper, SystemPropertyMapper } from "./SystemPropertyMappers";

export class SystemProperty<PropertyType> {

    static readonly NAME: SystemProperty<string> = new SystemProperty('name', new StringPropertyMapper())
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