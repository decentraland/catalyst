import express from "express";
import { Service, EntityType, Entity } from "../service/service"

export class Controller {
    private service: Service;

    constructor(service: Service) { 
        this.service = service
        this.getEntities         = this.getEntities.bind(this);
        this.createEntity        = this.createEntity.bind(this);
        this.getContent          = this.getContent.bind(this);
        this.getAvailableContent = this.getAvailableContent.bind(this);
        this.getPointers         = this.getPointers.bind(this);
        this.getAudit            = this.getAudit.bind(this);
        this.getHistory          = this.getHistory.bind(this);

    } 

    getEntities(req: express.Request, res: express.Response) {
        console.log("this: " + this)
        console.log("this.service: " + this.service)
        // Method: GET
        // Path: /entities/:type
        // Query String: ?{filter}&fields={fieldList}
        const type     = req.params.type
        const pointers = req.query.pointer
        const ids      = req.query.id
        const fields:string   = req.query.fields

        // Validate type is correct
        let enumType = EntityType[type]

        // Validate pointers or ids are present, but not both
        if ((ids && pointers) || (!ids && !pointers)) {
            res.status(400).send({ error: 'ids or pointers must be present, but not both' });
            return
        }

        // Validate fields are correct or empty
        let enumFields: EntityField[]|undefined = undefined
        if (fields) {
            enumFields = fields.split(',').map(f => EntityField[f])
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

    private maskEntity(fullEntity: Entity, fields: EntityField[]|undefined): Entity {
        if (!fields) {
            return fullEntity
        }
        let maskedEntity = new Entity()
        maskedEntity.id = fullEntity.id
        maskedEntity.type = fullEntity.type
        maskedEntity.timestamp = fullEntity.timestamp
        if (fields.includes(EntityField.CONTENTS)) {
            maskedEntity.content = fullEntity.content
        }
        if (fields.includes(EntityField.METADATA)) {
            maskedEntity.metadata = fullEntity.metadata
        }
        if (fields.includes(EntityField.POINTERS)) {
            maskedEntity.pointers = fullEntity.pointers
        }
        return maskedEntity
    }
      
    createEntity(req: express.Request, res: express.Response) {
        // Method: POST
        // Path: /entities
        // Body: JSON with entityId,ethAddress,signature; and a set of files
        const entityId   = req.body.entityId;
        const ethAddress = req.body.ethAddress;
        const signature  = req.body.signature;
        const files      = req.files
      
        res.send({
            entityId: entityId,
            ethAddress: ethAddress,
            signature: signature,
            files: files,
        })
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
        const cids = req.query.cid
        
        res.send({
            cids: cids,
        })
    }
      
    getPointers(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /pointers/:type
        const type = req.params.type;
        
        res.send({
            type: type,
        })
    }
    
    getAudit(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /audit/:type/:entityId
        const type     = req.params.type;
        const entityId = req.params.entityId;
        
        res.send({
            type: type,
            entityId: entityId,
        })
    }
      
    getHistory(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /history
        // Query String: ?from={timestamp}&to={timestamp}&type={type}
        const from = req.query.from
        const to   = req.query.to
        const type = req.query.type
        
        res.send({
            from: from,
            to: to,
            type: type,
        })
    }

}

export enum EntityField {
    CONTENTS, 
    POINTERS,
    METADATA,
}
