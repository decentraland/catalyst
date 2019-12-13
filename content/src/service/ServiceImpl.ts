import { ContentStorage } from "../storage/ContentStorage";
import { FileHash, Hashing } from "./Hashing";
import { EntityType, Pointer, EntityId, Entity } from "./Entity";
import { Validation } from "./Validation";
import { Service, EthAddress, Signature, Timestamp, ENTITY_FILE_NAME, AuditInfo, File } from "./Service";
import { EntityFactory } from "./EntityFactory";
import { HistoryManager } from "./history/HistoryManager";

export class ServiceImpl implements Service {

    private referencedEntities: Map<EntityType, Map<Pointer, EntityId>> = new Map();
    private entities: Map<EntityId, Entity> = new Map();

    constructor(private storage: ContentStorage, private historyManager: HistoryManager) {

        // Register type on global map. This way, we don't have to check on each deployment
        Object.values(EntityType)
            .forEach((entityType: EntityType) => this.referencedEntities.set(entityType, new Map()))
    }

    getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<Entity[]> {
        return Promise.all(pointers
            .map((pointer: Pointer) => this.getEntityIdByPointer(type, pointer)))
            .then((entityIds:(EntityId|undefined)[]) => entityIds.filter(entity => entity !== undefined))
            .then(entityIds => this.getEntitiesByIds(type, entityIds as EntityId[]))
    }

    getEntitiesByIds(type: EntityType, ids: EntityId[]): Promise<Entity[]> {
        return Promise.all(ids
            .filter((elem, pos, array) => array.indexOf(elem) == pos) // Removing duplicates. Quickest way to do so.
            .map((entityId: EntityId) => this.getEntityById(entityId)))
            .then((entities:(Entity|undefined)[]) => entities.filter(entity => entity !== undefined)) as Promise<Entity[]>
    }

    private async getEntityById(id: EntityId): Promise<Entity | undefined> {
        let entity = this.entities.get(id)
        if (!entity) {
            // Try to get the entity from the storage
            try {
                const buffer = await this.storage.getContent(StorageCategory.CONTENTS, id)
                entity = EntityFactory.fromBuffer(buffer, id)
                this.entities.set(id, entity)
            } catch (error) { }
        }
        return entity
    }

    private async getEntityIdByPointer(type: EntityType, pointer: Pointer): Promise<EntityId | undefined> {
        let entityId = this.referencedEntities.get(type)?.get(pointer)
        if (!entityId) {
            // Try to get the entity from the storage
            try {
                const buffer = await this.storage.getContent(this.resolveCategory(StorageCategory.POINTERS, type), pointer)
                entityId = buffer?.toString()
                this.referencedEntities.get(type)?.set(pointer, entityId)
            } catch (error) { }
        }
        return entityId
    }

    getActivePointers(type: EntityType): Promise<Pointer[]> {
        return Promise.resolve(Array.from(this.referencedEntities.get(type)?.keys() || []))
    }

    async deployEntity(files: Set<File>, entityId: EntityId, ethAddress: EthAddress, signature: Signature): Promise<Timestamp> {
        // Validate signature
        Validation.validateSignature(entityId, ethAddress, signature)

        // Validate request size
        Validation.validateRequestSize(files)

        // Find entity file and make sure its hash is the expected
        const entityFile: File = this.findEntityFile(files)
        if (entityId !== await Hashing.calculateHash(entityFile)) {
            throw new Error("Entity file's hash didn't match the signed entity id.")
        }

        // Parse entity file into an Entity
        const entity: Entity = EntityFactory.fromFile(entityFile, entityId)

        // Validate entity
        Validation.validateEntity(entity)

        // Validate ethAddress access
        Validation.validateAccess(entity.pointers, ethAddress, entity.type)

        // Validate that the entity is "fresh"
        Validation.validateFreshDeployment(entity)

        // Type validation
        Validation.validateType(entity)

        // Hash all files, and validate them
        const hashes: Map<FileHash, File> = await Hashing.calculateHashes(files)
        const alreadyStoredHashes: Map<FileHash, Boolean> = await this.isContentAvailable(Array.from(hashes.keys()));
        Validation.validateHashes(entity, hashes, alreadyStoredHashes)

        // IF THIS POINT WAS REACHED, THEN THE DEPLOYMENT WILL BE COMMITED

        // Delete entities and pointers that the new deployment would overwrite
        await this.deleteOverwrittenEntities(entity)

        // Register the new entity on global variables
        await this.commitNewEntity(hashes, alreadyStoredHashes, entity)

        // TODO: Save audit information

        // TODO: Add to history

        // Add the new deployment to history
        this.historyManager.newEntityDeployment(entity)

        return Promise.resolve(Date.now())
    }

    private async commitNewEntity(hashes: Map<FileHash, File>, alreadyStoredHashes: Map<FileHash, Boolean>, entity: Entity): Promise<void> {
        // Register entity
        this.entities.set(entity.id, entity)

        // Make each pointer point to new entity
        let entitiesInType: Map<Pointer, EntityId> | undefined = this.referencedEntities.get(entity.type)
        entity.pointers.forEach(pointer => entitiesInType?.set(pointer, entity.id))

        // Store content that isn't already stored
        const contentStorageActions: Promise<void>[] = Array.from(hashes.entries())
            .filter(([fileHash, file]) => !alreadyStoredHashes.get(fileHash))
            .map(([fileHash, file]) => this.storage.store(this.resolveCategory(StorageCategory.CONTENTS), fileHash, file.content))


        // Store reference from pointers to entity
        const pointerStorageActions: Promise<void>[] = entity.pointers
            .map((pointer: Pointer) => this.storage.store(this.resolveCategory(StorageCategory.POINTERS, entity.type), pointer, Buffer.from(entity.id)));

        await Promise.all([...contentStorageActions, ...pointerStorageActions])
    }

    private async deleteOverwrittenEntities(entity: Entity): Promise<void> {
        // Calculate the entities that the new deployment would overwrite
        const overwrittenEntities: EntityId[] = entity.pointers
            .map((pointer: Pointer) => this.referencedEntities.get(entity.type)?.get(pointer))
            .filter((entityId: EntityId | undefined): entityId is EntityId => !!entityId)
            .filter((elem, pos, array) => array.indexOf(elem) == pos) // Removing duplicates. Quickest way to do so.

        // Calculate the pointers that would result orphan
        const orphanPointers: Pointer[] = overwrittenEntities
            .map((entityId: EntityId) => this.entities.get(entityId)?.pointers || [])
            .reduce((accum, pointers) => accum.concat(pointers), [])
            .filter((pointer: Pointer) => !entity.pointers.includes(pointer))

        // Delete orphan pointers
        const pointerDeletionActions: Promise<void>[] = orphanPointers
            .map((orphanPointer: Pointer) => this.storage.delete(this.resolveCategory(StorageCategory.POINTERS, entity.type), orphanPointer))

        for (const orphanPointer of orphanPointers) {
            this.referencedEntities.get(entity.type)?.delete(orphanPointer)
        }

        await Promise.all(pointerDeletionActions)

        // Delete the entities from the global map
        overwrittenEntities.forEach((entityId: EntityId) => this.entities.delete(entityId))
    }

    private findEntityFile(files: Set<File>): File {
        const filesWithName = Array.from(files)
            .filter(file => file.name === ENTITY_FILE_NAME)
        if (filesWithName.length === 0) {
            throw new Error(`Failed to find the entity file. Please make sure that it is named '${ENTITY_FILE_NAME}'.`)
        } else if (filesWithName.length > 1) {
            throw new Error(`Found more than one file called '${ENTITY_FILE_NAME}'. Please make sure you upload only one with that name.`)
        }

        return filesWithName[0];
    }

    getContent(fileHash: FileHash): Promise<Buffer> {
        // TODO: Catch potential exception if content doesn't exist, and return better error message
        return this.storage.getContent(this.resolveCategory(StorageCategory.CONTENTS), fileHash);
    }

    getAuditInfo(type: EntityType, id: EntityId): Promise<AuditInfo> {
        return Promise.resolve({
            deployedTimestamp: 1,
            ethAddress: "",
            signature: ""
        })
    }

    async isContentAvailable(fileHashes: FileHash[]): Promise<Map<FileHash, Boolean>> {
        const contentsAvailableActions: Promise<[FileHash, Boolean]>[] = fileHashes.map((fileHash: FileHash) =>
            this.storage.exists(this.resolveCategory(StorageCategory.CONTENTS), fileHash)
                .then(exists => [fileHash, exists]))

        return new Map(await Promise.all(contentsAvailableActions));
    }

    /** Resolve a category name, based on the storage category and the entity's type */
    private resolveCategory(storageCategory: StorageCategory, type?: EntityType): string {
        return storageCategory + (storageCategory === StorageCategory.POINTERS && type ? `-${type}` : "")
    }
}

const enum StorageCategory {
    CONTENTS = "contents",
    PROOFS = "proofs",
    POINTERS = "pointers",
}
