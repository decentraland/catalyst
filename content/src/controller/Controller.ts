import express from "express";
import { EntityType, Entity, EntityId, Pointer } from "../service/Entity"
import fs from "fs"
import { Service, File, Signature, EthAddress } from "../service/Service";
import { HistoryType, HistoryManager } from "../service/history/HistoryManager";
import { ControllerEntityFactory } from "./ControllerEntityFactory";

export class Controller {
    constructor(private service: Service, private historyManager: HistoryManager) { }

    getEntities(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /entities/:type
        // Query String: ?{filter}&fields={fieldList}
        const type:EntityType    = this.parseEntityType(req.params.type)
        const pointers:Pointer[] = this.asArray<Pointer>(req.query.pointer)
        const ids:EntityId[]     = this.asArray<EntityId>(req.query.id)
        const fields:string      = req.query.fields

        // Validate type is valid
        if (!type) {
            res.status(400).send({ error: `Unrecognized type: ${req.params.type}` });
            return
        }

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
        if (ids.length > 0) {
            entities = this.service.getEntitiesByIds(type, ids)
        } else {
            entities = this.service.getEntitiesByPointers(type, pointers)
        }
        entities
        .then(fullEntities => fullEntities.map(fullEntity => ControllerEntityFactory.maskEntity(fullEntity, enumFields)))
        .then(maskedEntities => res.send(maskedEntities))
    }

    private parseEntityType(strType: string): EntityType {
        if (strType.endsWith('s')) {
            strType = strType.slice(0, -1)
        }
        strType = strType.toUpperCase().trim()
        const type = EntityType[strType]
        return type
    }

    private asArray<T>(elements: T[]|T): T[] {
        if (!elements) {
            return []
        }
        if (elements instanceof Array) {
            return elements
        }
        return [elements]
    }

    createEntity(req: express.Request, res: express.Response) {
        // Method: POST
        // Path: /entities
        // Body: JSON with entityId,ethAddress,signature; and a set of files
        const entityId:EntityId     = req.body.entityId;
        const ethAddress:EthAddress = req.body.ethAddress;
        const signature:Signature   = req.body.signature;
        const files                 = req.files

        let deployFiles = Promise.resolve(new Set<File>())
        if (files instanceof Array) {
            deployFiles = Promise.all(files.map(f => this.readFile(f.fieldname, f.path))).then(fileArray => new Set<File>(fileArray))
        }
        deployFiles
        .then(fileSet => this.service.deployEntity(fileSet, entityId, ethAddress, signature))
        .then(t => res.send({
            creationTimestamp: t
        }))
    }
    private async readFile(name: string, path: string): Promise<File> {
        return {
            name: name,
            content: await fs.promises.readFile(path)
        }
    }

    getContent(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /contents/:hashId
        const hashId = req.params.hashId;

        this.service.getContent(hashId)
        .then((data:Buffer) => {
            res.contentType('application/octet-stream')
            res.end(data, 'binary')
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
        const type:EntityType  = this.parseEntityType(req.params.type)

        // Validate type is valid
        if (!type) {
            res.status(400).send({ error: `Unrecognized type: ${req.params.type}` });
            return
        }

        this.service.getActivePointers(type)
        .then(pointers => res.send(pointers))
    }

    getAudit(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /audit/:type/:entityId
        const type     = this.parseEntityType(req.params.type)
        const entityId = req.params.entityId;

        // Validate type is valid
        if (!type) {
            res.status(400).send({ error: `Unrecognized type: ${req.params.type}` });
            return
        }

        this.service.getAuditInfo(type, entityId)
        .then(auditInfo => res.send(auditInfo))
    }

    getHistory(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /history
        // Query String: ?from={timestamp}&to={timestamp}&type={type}
        const from = req.query.from
        const to   = req.query.to
        const type = req.params.type ? this.parseHistoryType(req.params.type) : undefined

        this.historyManager.getHistory(from, to, type)
        .then(history => res.send(history))
    }

    private parseHistoryType(strType: string): HistoryType {
        if (strType.endsWith('s')) {
            strType = strType.slice(0, -1)
        }
        strType = strType.toUpperCase().trim()
        const type = HistoryType[strType]
        return type
    }

}

export class ControllerEntity {
    id: string
    type: string
    pointers: string[]
    timestamp: number
    content?: [string, string][]
    metadata?: any
}

export enum EntityField {
    CONTENT = "content",
    POINTERS = "pointers",
    METADATA = "metadata",
}

