import express from "express";
import log4js from "log4js"
import fs from "fs"
import { EntityType, Pointer, EntityId, ContentFile, Timestamp, Entity as ControllerEntity, EntityVersion, ContentFileHash, LegacyAuditInfo, PartialDeploymentHistory } from "dcl-catalyst-commons";
import { MetaverseContentService, LocalDeploymentAuditInfo } from "../service/Service";
import { ControllerEntityFactory } from "./ControllerEntityFactory";
import { Denylist } from "../denylist/Denylist";
import { parseDenylistTypeAndId } from "../denylist/DenylistTarget";
import { CURRENT_CONTENT_VERSION, CURRENT_COMMIT_HASH } from "../Environment";
import { EthAddress, Signature, AuthLink, AuthChain } from "dcl-crypto";
import { Authenticator } from "dcl-crypto";
import { ContentItem } from "../storage/ContentStorage";
import { SynchronizationManager } from "../service/synchronization/SynchronizationManager";
import { ChallengeSupervisor } from "../service/synchronization/ChallengeSupervisor";
import { ContentAuthenticator } from "../service/auth/Authenticator";
import { ControllerDeploymentFactory } from "./ControllerDeploymentFactory";
import { Deployment } from "../service/deployments/DeploymentManager";

export class Controller {

    private static readonly LOGGER = log4js.getLogger('Controller');

    constructor(private readonly service: MetaverseContentService,
        private readonly denylist: Denylist,
        private readonly synchronizationManager: SynchronizationManager,
        private readonly challengeSupervisor: ChallengeSupervisor,
        private readonly ethNetwork: string) { }

    async getEntities(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /entities/:type
        // Query String: ?{filter}&fields={fieldList}
        const type:EntityType    = this.parseEntityType(req.params.type)
        const pointers:Pointer[] = this.asArray<Pointer>(req.query.pointer) ?? []
        const ids:EntityId[]     = this.asArray<EntityId>(req.query.id) ?? []
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
        let history: PartialDeploymentHistory<Deployment>
        if (ids.length > 0) {
            history = await this.service.getDeployments({ entityTypes: [type], entityIds: ids })
        } else {
            history = await this.service.getDeployments({ entityTypes: [type], pointers, onlyCurrentlyPointed: true })
        }
        const maskedEntities: ControllerEntity[] = history.deployments.map(fullDeployment => ControllerEntityFactory.maskDeployment(fullDeployment, enumFields))
        res.send(maskedEntities)
    }

    private parseEntityType(strType: string): EntityType {
        if (strType.endsWith('s')) {
            strType = strType.slice(0, -1)
        }
        strType = strType.toUpperCase().trim()
        const type = EntityType[strType]
        return type
    }

    private asArray<T>(elements: T[]): T[] | undefined {
        if (!elements) {
            return undefined
        }
        if (elements instanceof Array) {
            return elements
        }
        return [elements]
    }

    async createLegacyEntity(req: express.Request, res: express.Response) {
        // Method: POST
        // Path: /legacy-entities
        // Body: JSON with entityId,ethAddress,signature,version,migration_data; and a set of files
        const entityId:EntityId     = req.body.entityId;
        const authChain:AuthChain   = req.body.authChain;
        const originalVersion:EntityVersion = EntityVersion[req.body.version.toUpperCase().trim()];
        const migrationInformation  = JSON.parse(req.body.migration_data);
        const files                 = req.files

        try {
            const auditInfo: LocalDeploymentAuditInfo = {
                authChain,
                version: CURRENT_CONTENT_VERSION,
                migrationData: {
                    originalVersion,
                    data: migrationInformation
                }
            }

            let deployFiles: ContentFile[] = []
            if (files instanceof Array) {
                deployFiles = await Promise.all(files.map(f => this.readFile(f.fieldname, f.path)))
            }
            const creationTimestamp = await this.service.deployLocalLegacy(deployFiles, entityId, auditInfo)
            res.send({
                creationTimestamp: creationTimestamp
            })
        } catch (error) {
            Controller.LOGGER.warn(`Returning error '${error.message}'`)
            res.status(500).send(error.message) // TODO: Improve and return 400 if necessary
        }
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

        try {
            if (!authChain && ethAddress && signature) {
                authChain = Authenticator.createSimpleAuthChain(entityId, ethAddress, signature)
            }

            let deployFiles: ContentFile[] = []
            if (files instanceof Array) {
                deployFiles = await Promise.all(files.map(f => this.readFile(f.fieldname, f.path)))
            }

            const auditInfo: LocalDeploymentAuditInfo = { authChain, version: CURRENT_CONTENT_VERSION }
            let creationTimestamp: Timestamp
            if (fixAttempt) {
                creationTimestamp = await this.service.deployToFix(deployFiles, entityId, auditInfo, origin)
            } else {
                creationTimestamp = await this.service.deployEntity(deployFiles, entityId, auditInfo, origin)
            }
            res.send({ creationTimestamp })
        } catch (error) {
            Controller.LOGGER.warn(`Returning error '${error.message}'`)
            res.status(500).send(error.message) // TODO: Improve and return 400 if necessary
        }
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
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

            if(data.getLength()) {
                res.setHeader('Content-Length', data.getLength()!.toString())
            }
            data.asStream().pipe(res)
        } else {
            res.status(404).send()
        }
    }

    async getAvailableContent(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /available-content
        // Query String: ?cid={hashId1}&cid={hashId2}
        const cids = this.asArray<ContentFileHash>(req.query.cid)

        if (!cids) {
            res.status(400).send('Please set at least one cid.')
        } else {
            const availableContent = await this.service.isContentAvailable(cids)
            res.send(Array.from(availableContent.entries()).map(([fileHash, isAvailable]) => ({ cid: fileHash, available: isAvailable })))
        }
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

        const { deployments } = await this.service.getDeployments({ entityIds: [entityId], entityTypes: [type] })

        if (deployments.length > 0) {
            const { auditInfo } = deployments[0]
            const legacyAuditInfo: LegacyAuditInfo = {
                version: auditInfo.version,
                deployedTimestamp: auditInfo.originTimestamp,
                authChain: auditInfo.authChain,
                overwrittenBy: auditInfo.overwrittenBy,
                isDenylisted: auditInfo.isDenylisted,
                denylistedContent: auditInfo.denylistedContent,
                originalMetadata: auditInfo.migrationData
            }
            res.send(legacyAuditInfo)
        } else {
            res.status(404).send()
        }
    }

    async getHistory(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /history
        // Query String: ?from={timestamp}&to={timestamp}&serverName={string}
        const from       = req.query.from
        const to         = req.query.to
        const serverName = req.query.serverName
        const offset     = this.asInt(req.query.offset)
        const limit      = this.asInt(req.query.limit)

        const history = await this.service.getLegacyHistory(from, to, serverName, offset, limit)
        res.send(history)
    }

    async getDeployments(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /deployments
        // Query String: ?fromLocalTimestamp={timestamp}&toLocalTimestamp={timestamp}&entityType={entityType}&entityId={entityId}&onlyCurrentlyPointed={boolean}&deployedBy={ethAddress}

        const stringEntityTypes = this.asArray<string>(req.query.entityType);
        const entityTypes:(EntityType|undefined)[] | undefined = stringEntityTypes ? stringEntityTypes.map(type => this.parseEntityType(type)) : undefined
        const entityIds:EntityId[] | undefined       = this.asArray<EntityId>(req.query.entityId)
        const fromLocalTimestamp: number | undefined = this.asInt(req.query.fromLocalTimestamp)
        const toLocalTimestamp: number | undefined   = this.asInt(req.query.toLocalTimestamp)
        const onlyCurrentlyPointed: boolean | undefined = this.asBoolean(req.query.onlyCurrentlyPointed)
        const showAudit: boolean                     = this.asBoolean(req.query.showAudit) ?? false
        const deployedBy: EthAddress[] | undefined   = this.asArray<EthAddress>(req.query.deployedBy)
        const pointers: Pointer[] | undefined        = this.asArray<Pointer>(req.query.pointer)
        const offset: number | undefined             = this.asInt(req.query.offset)
        const limit: number | undefined              = this.asInt(req.query.limit)

        // Validate type is valid
        if (entityTypes && entityTypes.some(type => !type)) {
            res.status(400).send({ error: `Found an unrecognized entity type` });
            return
        }

        const requestFilters = { pointers, fromLocalTimestamp, toLocalTimestamp, entityTypes: (entityTypes as EntityType[]) , entityIds, deployedBy, onlyCurrentlyPointed }
        const { deployments, filters, pagination } = await this.service.getDeployments(requestFilters, offset, limit)
        const controllerDeployments = deployments.map(deployment => ControllerDeploymentFactory.deployment2ControllerEntity(deployment))
            .map(deployment => (!showAudit ? {...deployment, auditInfo: undefined } : deployment))

        res.send( { deployments: controllerDeployments, filters, pagination })
    }

    private asInt(value: any): number | undefined {
        return value ? parseInt(value) : undefined
    }

    private asBoolean(value: any): boolean | undefined {
        return value ? (value === 'true') : undefined
    }

    async getStatus(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /status

        const serverStatus = this.service.getStatus();

        const synchronizationStatus = this.synchronizationManager.getStatus()

        res.send({ ...serverStatus,
            synchronizationStatus,
            commitHash: CURRENT_COMMIT_HASH,
            ethNetwork: this.ethNetwork,
         })
    }

    async addToDenylist(req: express.Request, res: express.Response) {
        // Method: PUT
        // Path: /denylist/{type}/{id}
        // Body: JSON with ethAddress, signature and timestamp

        const blocker: EthAddress = req.body.blocker;
        const timestamp: Timestamp = req.body.timestamp;
        const signature: Signature = req.body.signature;
        let authChain: AuthChain = req.body.authChain

        const type = req.params.type
        const id = req.params.id;

        const target = parseDenylistTypeAndId(type, id)

        if (!authChain && blocker && signature) {
            const messageToSign = Denylist.buildMessageToSign(target, timestamp)
            authChain = ContentAuthenticator.createSimpleAuthChain(messageToSign, blocker, signature)
        }

        try {
            await this.denylist.addTarget(target, { timestamp, authChain })
            res.status(201).send()
        } catch (error) {
            res.status(500).send(error.message) // TODO: Improve and return 400 if necessary
        }
    }

    async removeFromDenylist(req: express.Request, res: express.Response) {
        // Method: DELETE
        // Path: /denylist/{type}/{id}
        // Query String: ?blocker={ethAddress}&timestamp={timestamp}&signature={signature}

        const blocker: EthAddress = req.query.blocker;
        const timestamp: Timestamp = req.query.timestamp;
        const signature: Signature = req.query.signature;

        const type = req.params.type
        const id = req.params.id;

        const target = parseDenylistTypeAndId(type, id)
        const messageToSign = Denylist.buildMessageToSign(target, timestamp)
        const authChain: AuthChain = ContentAuthenticator.createSimpleAuthChain(messageToSign, blocker, signature)

        // TODO: Based on the error, return 400 or 404
        try {
            await this.denylist.removeTarget(target, { timestamp, authChain })
            res.status(200).send()
        } catch (error) {
            res.status(500).send(error.message) // TODO: Improve and return 400 if necessary
        }
    }

    async getAllDenylistTargets(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /denylist

        const denylistTargets = await this.denylist.getAllDenylistedTargets();
        const controllerTargets: ControllerDenylistData[] = denylistTargets
            .map(({ target, metadata }) => ({ target: target.asObject(), metadata }))
        res.send(controllerTargets)
    }

    async isTargetDenylisted(req: express.Request, res: express.Response) {
        // Method: HEAD
        // Path: /denylist/{type}/{id}

        const type = req.params.type
        const id = req.params.id;

        const target = parseDenylistTypeAndId(type, id)
        const isDenylisted = await this.denylist.isTargetDenylisted(target)
        res.status(isDenylisted ? 200 : 404).send()
    }

    async getFailedDeployments(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /failedDeployments

        const failedDeployments = await this.service.getAllFailedDeployments()
        res.send(failedDeployments)
    }

    async getChallenge(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /challenge

        const challengeText = this.challengeSupervisor.getChallengeText()
        res.send({ challengeText })
    }

}

export enum EntityField {
    CONTENT = "content",
    POINTERS = "pointers",
    METADATA = "metadata",
}

export type ControllerDenylistData = {
    target: {
        type: string,
        id: string,
    },
    metadata: {
        timestamp: Timestamp,
        authChain: AuthChain,
    }
}

