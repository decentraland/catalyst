import express from "express";
import log4js from "log4js"
import fs from "fs"
import { EntityType, Entity, EntityId, Pointer } from "../service/Entity"
import { MetaverseContentService, ContentFile } from "../service/Service";
import { Timestamp } from "../service/time/TimeSorting";
import { HistoryManager } from "../service/history/HistoryManager";
import { ControllerEntityFactory } from "./ControllerEntityFactory";
import { Blacklist } from "../blacklist/Blacklist";
import { parseBlacklistTypeAndId } from "../blacklist/BlacklistTarget";
import { NO_TIMESTAMP, EntityVersion, AuditInfo } from "../service/audit/Audit";
import { CURRENT_CONTENT_VERSION } from "../Environment";
import { EthAddress, Signature, AuthLink } from "dcl-crypto";
import { Authenticator } from "dcl-crypto";
import { ContentItem } from "../storage/ContentStorage";
import { FailedDeploymentsManager } from "../service/errors/FailedDeploymentsManager";

export class Controller {

    private static readonly LOGGER = log4js.getLogger('Controller');

    constructor(private readonly service: MetaverseContentService,
        private readonly historyManager: HistoryManager,
        private readonly blacklist: Blacklist,
        private readonly failedDeploymentsManager: FailedDeploymentsManager) { }

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

        // Calculate and mask entities
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

    createLegacyEntity(req: express.Request, res: express.Response) {
        // Method: POST
        // Path: /legacy-entities
        // Body: JSON with entityId,ethAddress,signature,version,migration_data; and a set of files
        const entityId:EntityId     = req.body.entityId;
        const ethAddress:EthAddress = req.body.ethAddress;
        const signature:Signature   = req.body.signature;
        const originalVersion:EntityVersion = EntityVersion[req.body.version.toUpperCase().trim()];
        const migrationInformation  = JSON.parse(req.body.migration_data);
        const files                 = req.files

        const auditInfo: AuditInfo = {
            authChain: Authenticator.createSimpleAuthChain(entityId, ethAddress, signature),
            deployedTimestamp: NO_TIMESTAMP,
            version: CURRENT_CONTENT_VERSION,
            originalMetadata: {
                originalVersion,
                data: migrationInformation
            }
        }

        let deployFiles: Promise<ContentFile[]> = Promise.resolve([])
        if (files instanceof Array) {
            deployFiles = Promise.all(files.map(f => this.readFile(f.fieldname, f.path)))
        }
        deployFiles
        .then(fileSet => this.service.deployEntity(fileSet, entityId, auditInfo, 'legacy'))
        .then(t => res.send({
            creationTimestamp: t
        }))
        .catch(error => {
            Controller.LOGGER.warn(`Returning error '${error.message}'`)
            res.status(500).send(error.message) // TODO: Improve and return 400 if necessary
        })
    }

    async createEntity(req: express.Request, res: express.Response) {
        // Method: POST
        // Path: /entities
        // Body: JSON with entityId,ethAddress,signature; and a set of files
        const entityId:EntityId     = req.body.entityId;
        let   authChain: AuthLink[] = req.body.authChain;
        const ethAddress:EthAddress = req.body.ethAddress;
        const signature:Signature   = req.body.signature;
        const files                 = req.files
        const origin                = req.header('x-upload-origin') ?? "unknown"
        const fixAttempt: boolean   = req.query.fix === 'true'

        if (!authChain && ethAddress && signature) {
            authChain = Authenticator.createSimpleAuthChain(entityId, ethAddress, signature)
        }

        let deployFiles: ContentFile[] = []
        if (files instanceof Array) {
            deployFiles = await Promise.all(files.map(f => this.readFile(f.fieldname, f.path)))
        }

        const auditInfo: AuditInfo = { authChain, deployedTimestamp: NO_TIMESTAMP, version: CURRENT_CONTENT_VERSION }
        let deployment: Promise<Timestamp>
        if (fixAttempt) {
            deployment = this.service.deployToFix(deployFiles, entityId, auditInfo, origin)
        } else {
            deployment = this.service.deployEntity(deployFiles, entityId, auditInfo, origin)
        }
        await deployment
            .then(creationTimestamp => res.send({ creationTimestamp }))
            .catch(error => {
                Controller.LOGGER.warn(`Returning error '${error.message}'`)
                res.status(500).send(error.message) // TODO: Improve and return 400 if necessary
            })
    }

    private async readFile(name: string, path: string): Promise<ContentFile> {
        return {
            name: name,
            content: await fs.promises.readFile(path)
        }
    }

    async getContent(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /contents/:hashId
        const hashId = req.params.hashId;

        const data: ContentItem | undefined = await this.service.getContent(hashId);
        if (data) {
            res.contentType('application/octet-stream')
            res.setHeader('ETag', hashId)
            res.setHeader('Access-Control-Expose-Headers', '*')
            data.asStream().pipe(res)
        } else {
            res.status(404).send()
        }
    }

    getAvailableContent(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /available-content
        // Query String: ?cid={hashId1}&cid={hashId2}
        const cids = this.asArray(req.query.cid)

        this.service.isContentAvailable(cids)
            .then(availableContent => res.send(
                Array.from(availableContent.entries())
                    .map(([fileHash, isAvailable]) => ({ cid: fileHash, available: isAvailable }))))
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

    async getAudit(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /audit/:type/:entityId
        const type     = this.parseEntityType(req.params.type)
        const entityId = req.params.entityId;

        // Validate type is valid
        if (!type) {
            res.status(400).send({ error: `Unrecognized type: ${req.params.type}` });
            return
        }

        const auditInfo = await this.service.getAuditInfo(type, entityId)
        if (auditInfo) {
            res.send(auditInfo)
        } else {
            res.status(404).send()
        }
    }

    getHistory(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /history
        // Query String: ?from={timestamp}&to={timestamp}&serverName={string}
        const from       = req.query.from
        const to         = req.query.to
        const serverName = req.query.serverName
        const offset     = this.asInt(req.query.offset)
        const limit      = this.asInt(req.query.limit)

        this.historyManager.getHistory(from, to, serverName, offset, limit)
        .then(history => res.send(history))
    }
    private asInt(value: any): number | undefined {
        return value ? parseInt(value) : undefined
    }

    getStatus(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /status

        this.service.getStatus()
        .then(status => res.send(status))
    }

    addToBlacklist(req: express.Request, res: express.Response) {
        // Method: PUT
        // Path: /blacklist/{type}/{id}
        // Body: JSON with ethAddress, signature and timestamp

        const blocker: EthAddress = req.body.blocker;
        const timestamp: Timestamp = req.body.timestamp;
        const signature: Signature = req.body.signature;

        const type = req.params.type
        const id = req.params.id;

        const target = parseBlacklistTypeAndId(type, id)
        return this.blacklist.addTarget(target, { blocker, timestamp ,signature })
            .then(() => res.status(201).send())
            .catch(error => res.status(500).send(error.message)) // TODO: Improve and return 400 if necessary
    }

    removeFromBlacklist(req: express.Request, res: express.Response) {
        // Method: DELETE
        // Path: /blacklist/{type}/{id}
        // Query String: ?blocker={ethAddress}&timestamp={timestamp}&signature={signature}

        const blocker: EthAddress = req.query.blocker;
        const timestamp: Timestamp = req.query.timestamp;
        const signature: Signature = req.query.signature;

        const type = req.params.type
        const id = req.params.id;

        const target = parseBlacklistTypeAndId(type, id)

        // TODO: Based on the error, return 400 or 404
        return this.blacklist.removeTarget(target, { blocker, timestamp ,signature })
            .then(() => res.status(200).send())
            .catch(error => res.status(500).send(error.message)) // TODO: Improve and return 400 if necessary
    }

    async getAllBlacklistTargets(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /blacklist

        const blacklistTargets = await this.blacklist.getAllBlacklistedTargets();
        const controllerTargets: ControllerBlacklistData[] = Array.from(blacklistTargets.entries())
            .map(([target, metadata]) => ({ target: target.asObject(), metadata: metadata }))
        res.send(controllerTargets)
    }

    isTargetBlacklisted(req: express.Request, res: express.Response) {
        // Method: HEAD
        // Path: /blacklist/{type}/{id}

        const type = req.params.type
        const id = req.params.id;

        const target = parseBlacklistTypeAndId(type, id)
        this.blacklist.isTargetBlacklisted(target)
            .then(isBlacklisted => isBlacklisted ? res.status(200).send() : res.status(404).send())
    }

    async getFailedDeployments(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /failedDeployments

        const failedDeployments = await this.failedDeploymentsManager.getAllFailedDeployments()
        res.send(failedDeployments)
    }

}

export interface ControllerEntity {
    id: string
    type: string
    pointers: string[]
    timestamp: number
    content?: ControllerEntityContent[]
    metadata?: any
}

export type ControllerEntityContent = {
    file: string,
    hash: string,
}

export enum EntityField {
    CONTENT = "content",
    POINTERS = "pointers",
    METADATA = "metadata",
}

type ControllerBlacklistData = {
    target: {
        type: string,
        id: string,
    },
    metadata: {
        blocker: EthAddress,
        timestamp: Timestamp,
        signature: Signature,
    }
}

