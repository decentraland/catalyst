import express from "express";
import { EntityType, Entity, EntityId, Pointer } from "../service/Entity"
import { Service, Timestamp, File, Signature, EthAddress } from "../service/Service";
import { FileHash } from "../service/Hashing";

export class Controller {
    constructor(private service: Service) { } 

    getEntities(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /entities/:type
        // Query String: ?{filter}&fields={fieldList}
        const type:string        = req.params.type
        const pointers:Pointer[] = this.asArray<Pointer>(req.query.pointer)
        const ids:EntityId[]     = this.asArray<EntityId>(req.query.id)
        const fields:string      = req.query.fields

        // Validate type is correct
        let enumType = EntityType[type]

        // Validate pointers or ids are present, but not both
        if ((ids.length>0 && pointers.length>0) || (ids.length==0 && pointers.length==0)) {
            res.status(400).send({ error: 'ids or pointers must be present, but not both' });
            return
        }

        // Validate fields are correct or empty
        let enumFields: EntityField[]|undefined = undefined
        if (fields) {
            enumFields = fields.split(',').map(f => (<any>EntityField)[f.toUpperCase().trim()])
        }

        // Calculate and maks entities
        let entities: Promise<Entity[]>
        if (ids) {
            entities = this.service.getEntitiesByIds(enumType, ids)
        } else {
            entities = this.service.getEntitiesByPointers(enumType, pointers)
        }
        entities
        .then(fullEntities => fullEntities.map(fullEntity => this.maskEntity(fullEntity, enumFields)))
        .then(maskedEntities => res.send(maskedEntities))
    }

    private asArray<T>(elements: T[]|T): T[] {
        if (!!elements) {
            return []
        }
        if (elements instanceof Array) {
            return elements
        }
        return [elements]
    }

    private maskEntity(fullEntity: Entity, fields: EntityField[]|undefined): ControllerEntity {
        let maskedEntity = new ControllerEntity()
        maskedEntity.id = fullEntity.id
        maskedEntity.type = fullEntity.type
        maskedEntity.timestamp = fullEntity.timestamp
        if ((!fields || fields.includes(EntityField.CONTENT)) && fullEntity.content) {
            maskedEntity.content = fullEntity.content
        }
        if (!fields || fields.includes(EntityField.METADATA)) {
            maskedEntity.metadata = fullEntity.metadata
        }
        if ((!fields || fields.includes(EntityField.POINTERS)) && fullEntity.pointers) {
            maskedEntity.pointers = fullEntity.pointers
        }
        return maskedEntity
    }
      
    createEntity(req: express.Request, res: express.Response) {
        // Method: POST
        // Path: /entities
        // Body: JSON with entityId,ethAddress,signature; and a set of files
        const entityId:EntityId     = req.body.entityId;
        const ethAddress:EthAddress = req.body.ethAddress;
        const signature:Signature   = req.body.signature;
        const files                 = req.files
      
        let deployFiles: Set<File> = (files instanceof Array) 
            ? new Set<File>(files.map(f => ({
                name: f.fieldname, 
                content: Buffer.from(f.path)}))) 
            : new Set<File>()

        this.service.deployEntity(deployFiles, entityId, ethAddress, signature)
        .then(t => res.send({
            creationTimestamp: t
        }))
    }
    
    getContent(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /contents/:hashId
        const hashId = req.params.hashId;
      
        res.send({
            hashId: hashId,
        })
    }
    
    getAvailableContent(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /available-content
        // Query String: ?cid={hashId1}&cid={hashId2}
        const cids = this.asArray(req.query.cid)
        
        this.service.isContentAvailable(cids)
        .then(availableContent => res.send({
            availableContent: [...availableContent],
        }))
    }
      
    getPointers(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /pointers/:type
        const type = req.params.type;
        
        // Validate type is correct
        let enumType = EntityType[type]

        this.service.getActivePointers(enumType)
        .then(pointers => res.send(pointers))
    }
    
    getAudit(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /audit/:type/:entityId
        const type     = req.params.type;
        const entityId = req.params.entityId;

        // Validate type is correct
        let enumType = EntityType[type]

        this.service.getAuditInfo(enumType, entityId)
        .then(auditInfo => res.send(auditInfo))
    }
      
    getHistory(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /history
        // Query String: ?from={timestamp}&to={timestamp}&type={type}
        const from = req.query.from
        const to   = req.query.to
        const type = req.query.type
        
        // Validate type is correct
        let enumType = EntityType[type]

        this.service.getHistory(from, to, enumType)
        .then(history => res.send(history))
    }

}

export enum EntityField {
    CONTENT = "content", 
    POINTERS = "pointers",
    METADATA = "metadata",
}

export class ControllerEntity {
    id: EntityId
    type: EntityType
    pointers: Pointer[]
    timestamp: Timestamp
    content?: [string,FileHash][]
    metadata?: string    
}
