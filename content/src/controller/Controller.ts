import express from 'express'
import log4js from 'log4js'
import fs from 'fs'
import {
  EntityType,
  Pointer,
  EntityId,
  Timestamp,
  Entity as ControllerEntity,
  EntityVersion,
  ContentFileHash,
  LegacyAuditInfo,
  PartialDeploymentHistory,
  ServerAddress,
  LegacyPartialDeploymentHistory,
  LegacyDeploymentEvent,
  SortingField,
  SortingOrder
} from 'dcl-catalyst-commons'
import { MetaverseContentService, LocalDeploymentAuditInfo, ErrorList } from '../service/Service'
import { ControllerEntityFactory } from './ControllerEntityFactory'
import { Denylist } from '../denylist/Denylist'
import { parseDenylistTypeAndId } from '../denylist/DenylistTarget'
import { CURRENT_CONTENT_VERSION, CURRENT_COMMIT_HASH } from '../Environment'
import { EthAddress, Signature, AuthLink, AuthChain } from 'dcl-crypto'
import { Authenticator } from 'dcl-crypto'
import { ContentItem } from '../storage/ContentStorage'
import { SynchronizationManager } from '../service/synchronization/SynchronizationManager'
import { ChallengeSupervisor } from '../service/synchronization/ChallengeSupervisor'
import { ContentAuthenticator } from '../service/auth/Authenticator'
import { ControllerDeploymentFactory } from './ControllerDeploymentFactory'
import {
  Deployment,
  DeploymentPointerChanges,
  ExtendedDeploymentFilters
} from '../service/deployments/DeploymentManager'
import { SnapshotManager } from '../service/snapshots/SnapshotManager'

export class Controller {
  private static readonly LOGGER = log4js.getLogger('Controller')

  constructor(
    private readonly service: MetaverseContentService,
    private readonly denylist: Denylist,
    private readonly synchronizationManager: SynchronizationManager,
    private readonly challengeSupervisor: ChallengeSupervisor,
    private readonly snapshotManager: SnapshotManager,
    private readonly ethNetwork: string
  ) {}

  async getEntities(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /entities/:type
    // Query String: ?{filter}&fields={fieldList}
    const type: EntityType = this.parseEntityType(req.params.type)
    const pointers: Pointer[] = this.asArray<Pointer>(req.query.pointer)?.map((p) => p.toLowerCase()) ?? []
    const ids: EntityId[] = this.asArray<EntityId>(req.query.id) ?? []
    const fields: string = req.query.fields

    // Validate type is valid
    if (!type) {
      res.status(400).send({ error: `Unrecognized type: ${req.params.type}` })
      return
    }

    // Validate pointers or ids are present, but not both
    if ((ids.length > 0 && pointers.length > 0) || (ids.length == 0 && pointers.length == 0)) {
      res.status(400).send({ error: 'ids or pointers must be present, but not both' })
      return
    }

    // Validate fields are correct or empty
    let enumFields: EntityField[] | undefined = undefined
    if (fields) {
      enumFields = fields.split(',').map((f) => (<any>EntityField)[f.toUpperCase().trim()])
    }

    // Calculate and mask entities
    let history: PartialDeploymentHistory<Deployment>
    if (ids.length > 0) {
      history = await this.service.getDeployments({ filters: { entityTypes: [type], entityIds: ids } })
    } else {
      history = await this.service.getDeployments({
        filters: { entityTypes: [type], pointers, onlyCurrentlyPointed: true }
      })
    }
    const maskedEntities: ControllerEntity[] = history.deployments.map((fullDeployment) =>
      ControllerEntityFactory.maskDeployment(fullDeployment, enumFields)
    )
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

  async createLegacyEntity(req: express.Request, res: express.Response): Promise<void> {
    // Method: POST
    // Path: /legacy-entities
    // Body: JSON with entityId,ethAddress,signature,version,migration_data; and a set of files
    const entityId: EntityId = req.body.entityId
    const authChain: AuthChain = req.body.authChain
    const originalVersion: EntityVersion = EntityVersion[req.body.version.toUpperCase().trim()]
    const migrationInformation = JSON.parse(req.body.migration_data)
    const files = req.files

    const auditInfo: LocalDeploymentAuditInfo = {
      authChain,
      version: CURRENT_CONTENT_VERSION,
      migrationData: {
        originalVersion,
        data: migrationInformation
      }
    }

    const deployFiles: ContentFile[] = await this.readFiles(files)
    const creationTimestamp: Timestamp | ErrorList = await this.service.deployLocalLegacy(
      deployFiles,
      entityId,
      auditInfo
    )

    if (typeof creationTimestamp === 'number') {
      res.send({ creationTimestamp: creationTimestamp })
    } else {
      Controller.LOGGER.warn(`Returning error '${creationTimestamp.join()}'`)
      res.status(400).send(creationTimestamp.join())
    }
    await this.deleteUploadedFiles(deployFiles)
  }

  async createEntity(req: express.Request, res: express.Response): Promise<void> {
    // Method: POST
    // Path: /entities
    // Body: JSON with entityId,ethAddress,signature; and a set of files
    const entityId: EntityId = req.body.entityId
    const authChain: AuthLink[] = req.body.authChain
    const ethAddress: EthAddress = req.body.ethAddress
    const signature: Signature = req.body.signature
    const files = req.files
    const origin = req.header('x-upload-origin') ?? 'unknown'
    const fixAttempt: boolean = req.query.fix === 'true'

    const deployFiles: ContentFile[] = await this.readFiles(files)
    const auditInfo: LocalDeploymentAuditInfo = this.getAuditInfo(authChain, ethAddress, signature, entityId)
    let creationTimestamp: Timestamp | ErrorList = []
    if (fixAttempt) {
      creationTimestamp = await this.service.deployToFix(deployFiles, entityId, auditInfo, origin)
    } else {
      creationTimestamp = await this.service.deployEntity(deployFiles, entityId, auditInfo, origin)
    }

    if (typeof creationTimestamp === 'number') {
      res.send({ creationTimestamp })
    } else {
      Controller.LOGGER.warn(`Returning error '${creationTimestamp.join()}'`)
      res.status(400).send(creationTimestamp.join())
    }
    await this.deleteUploadedFiles(deployFiles)
  }

  private getAuditInfo(authChain: AuthLink[], ethAddress: string, signature: string, entityId: string) {
    if (!authChain && ethAddress && signature) {
      authChain = Authenticator.createSimpleAuthChain(entityId, ethAddress, signature)
    }
    return { authChain, version: CURRENT_CONTENT_VERSION }
  }

  private async readFiles(files: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[]) {
    if (files instanceof Array) {
      return await Promise.all(files.map((f) => this.readFile(f.fieldname, f.path)))
    } else {
      return []
    }
  }

  private async readFile(name: string, path: string): Promise<ContentFile> {
    return { name, path, content: await fs.promises.readFile(path) }
  }

  private async deleteUploadedFiles(deployFiles: ContentFile[]): Promise<void> {
    await Promise.all(
      deployFiles.map(async (deployFile) => {
        if (deployFile.path) {
          try {
            return await fs.promises.unlink(deployFile.path)
          } catch (error) {
            // Ignore these errors
          }
        }
        return Promise.resolve()
      })
    )
  }

  async getContent(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /contents/:hashId
    const hashId = req.params.hashId

    const data: ContentItem | undefined = await this.service.getContent(hashId)

    if (data) {
      res.contentType('application/octet-stream')
      res.setHeader('ETag', JSON.stringify(hashId)) // by spec, the ETag must be a double-quoted string
      res.setHeader('Access-Control-Expose-Headers', 'ETag')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

      if (data.getLength()) {
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
      res.send(
        Array.from(availableContent.entries()).map(([fileHash, isAvailable]) => ({
          cid: fileHash,
          available: isAvailable
        }))
      )
    }
  }

  async getAudit(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /audit/:type/:entityId
    const type = this.parseEntityType(req.params.type)
    const entityId = req.params.entityId

    // Validate type is valid
    if (!type) {
      res.status(400).send({ error: `Unrecognized type: ${req.params.type}` })
      return
    }

    const { deployments } = await this.service.getDeployments({
      filters: { entityIds: [entityId], entityTypes: [type] }
    })

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
    const fromOriginTimestamp = req.query.from
    const toOriginTimestamp = req.query.to
    const serverName = req.query.serverName
    const offset = this.asInt(req.query.offset)
    const limit = this.asInt(req.query.limit)

    const originServerUrl: ServerAddress | undefined = serverName ? decodeURIComponent(serverName) : undefined

    const requestFilters: ExtendedDeploymentFilters = { originServerUrl, fromOriginTimestamp, toOriginTimestamp }
    const deployments = await this.service.getDeployments({
      filters: requestFilters,
      sortBy: { field: SortingField.ORIGIN_TIMESTAMP, order: SortingOrder.DESCENDING },
      offset: offset,
      limit: limit
    })

    const finalDeployments: LegacyDeploymentEvent[] = deployments.deployments
      .slice(0, deployments.pagination.limit)
      .map((deployment) => ({
        entityType: deployment.entityType,
        entityId: deployment.entityId,
        timestamp: deployment.auditInfo.originTimestamp,
        serverName: encodeURIComponent(deployment.auditInfo.originServerUrl)
      }))

    const legacyHistory: LegacyPartialDeploymentHistory = {
      events: finalDeployments,
      filters: {
        from: fromOriginTimestamp,
        to: toOriginTimestamp,
        serverName: serverName
      },
      pagination: {
        offset: deployments.pagination.offset,
        limit: deployments.pagination.limit,
        moreData: deployments.pagination.moreData
      }
    }

    res.send(legacyHistory)
  }

  async getPointerChanges(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /pointerChanges
    // Query String: ?fromLocalTimestamp={timestamp}&toLocalTimestamp={timestamp}&offset={number}&limit={number}&entityType={entityType}
    const stringEntityTypes = this.asArray<string>(req.query.entityType)
    const entityTypes: (EntityType | undefined)[] | undefined = stringEntityTypes
      ? stringEntityTypes.map((type) => this.parseEntityType(type))
      : undefined
    const fromLocalTimestamp: Timestamp | undefined = this.asInt(req.query.fromLocalTimestamp)
    const toLocalTimestamp: Timestamp | undefined = this.asInt(req.query.toLocalTimestamp)
    const offset: number | undefined = this.asInt(req.query.offset)
    const limit: number | undefined = this.asInt(req.query.limit)

    // Validate type is valid
    if (entityTypes && entityTypes.some((type) => !type)) {
      res.status(400).send({ error: `Found an unrecognized entity type` })
      return
    }

    const requestFilters = {
      entityTypes: entityTypes as EntityType[] | undefined,
      fromLocalTimestamp,
      toLocalTimestamp
    }
    const { pointerChanges: deltas, filters, pagination } = await this.service.getPointerChanges(
      requestFilters,
      offset,
      limit
    )
    const controllerPointerChanges: ControllerPointerChanges[] = deltas.map((delta) => ({
      ...delta,
      changes: Array.from(delta.changes.entries()).map(([pointer, { before, after }]) => ({ pointer, before, after }))
    }))
    res.send({ deltas: controllerPointerChanges, filters, pagination })
  }

  async getDeployments(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /deployments
    // Query String: ?fromLocalTimestamp={timestamp}&toLocalTimestamp={timestamp}&entityType={entityType}&entityId={entityId}&onlyCurrentlyPointed={boolean}&deployedBy={ethAddress}

    const stringEntityTypes = this.asArray<string>(req.query.entityType)
    const entityTypes: (EntityType | undefined)[] | undefined = stringEntityTypes
      ? stringEntityTypes.map((type) => this.parseEntityType(type))
      : undefined
    const entityIds: EntityId[] | undefined = this.asArray<EntityId>(req.query.entityId)
    const fromLocalTimestamp: number | undefined = this.asInt(req.query.fromLocalTimestamp)
    const toLocalTimestamp: number | undefined = this.asInt(req.query.toLocalTimestamp)
    const onlyCurrentlyPointed: boolean | undefined = this.asBoolean(req.query.onlyCurrentlyPointed)
    const showAudit: boolean = this.asBoolean(req.query.showAudit) ?? false
    const deployedBy: EthAddress[] | undefined = this.asArray<EthAddress>(req.query.deployedBy)?.map((p) =>
      p.toLowerCase()
    )
    const pointers: Pointer[] | undefined = this.asArray<Pointer>(req.query.pointer)?.map((p) => p.toLowerCase())
    const offset: number | undefined = this.asInt(req.query.offset)
    const limit: number | undefined = this.asInt(req.query.limit)
    const fields: string | undefined = req.query.fields
    const sortingField: SortingField | undefined | 'unknown' = this.asEnumValue(SortingField, req.query.sortingField)
    const sortingOrder: SortingOrder | undefined | 'unknown' = this.asEnumValue(SortingOrder, req.query.sortingOrder)

    // Validate type is valid
    if (entityTypes && entityTypes.some((type) => !type)) {
      res.status(400).send({ error: `Found an unrecognized entity type` })
      return
    }

    // Validate fields are correct or empty
    let enumFields: DeploymentField[] = [...DEFAULT_FIELDS_ON_DEPLOYMENTS]
    if (fields && fields.trim().length > 0) {
      const acceptedValues = Object.values(DeploymentField).map((e) => e.toString())
      enumFields = fields
        .split(',')
        .filter((f) => acceptedValues.includes(f))
        .map((f) => f as DeploymentField)
    } else if (showAudit) {
      // TODO: Delete after one deployment
      enumFields.push(DeploymentField.AUDIT_INFO)
    }

    // Validate sorting fields and create sortBy
    const sortBy: { field?: SortingField; order?: SortingOrder } = {}
    if (sortingField) {
      if (sortingField == 'unknown') {
        res.status(400).send({ error: `Found an unrecognized sort field param` })
        return
      } else {
        sortBy.field = sortingField
      }
    }
    if (sortingOrder) {
      if (sortingOrder == 'unknown') {
        res.status(400).send({ error: `Found an unrecognized sort order param` })
        return
      } else {
        sortBy.order = sortingOrder
      }
    }
    const requestFilters = {
      pointers,
      fromLocalTimestamp,
      toLocalTimestamp,
      entityTypes: entityTypes as EntityType[],
      entityIds,
      deployedBy,
      onlyCurrentlyPointed
    }

    const { deployments, filters, pagination } = await this.service.getDeployments({
      filters: requestFilters,
      sortBy: sortBy,
      offset: offset,
      limit: limit
    })
    const controllerDeployments = deployments.map((deployment) =>
      ControllerDeploymentFactory.deployment2ControllerEntity(deployment, enumFields)
    )

    res.send({ deployments: controllerDeployments, filters, pagination })
  }

  private asEnumValue<T extends { [key: number]: string }>(
    enumType: T,
    stringToMap?: string
  ): T[keyof T] | undefined | 'unknown' {
    if (stringToMap) {
      const validEnumValues: Set<string> = new Set(Object.values(enumType))
      const match = validEnumValues.has(stringToMap)
      return match ? (stringToMap as T[keyof T]) : 'unknown'
    }
  }

  private asInt(value: any): number | undefined {
    return value ? parseInt(value) : undefined
  }

  private asBoolean(value: any): boolean | undefined {
    return value ? value === 'true' : undefined
  }

  async getStatus(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /status

    const serverStatus = this.service.getStatus()

    const synchronizationStatus = this.synchronizationManager.getStatus()

    res.send({
      ...serverStatus,
      synchronizationStatus,
      commitHash: CURRENT_COMMIT_HASH,
      ethNetwork: this.ethNetwork
    })
  }

  getSnapshot(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /snapshot/:type

    const type = this.parseEntityType(req.params.type)

    // Validate type is valid
    if (!type) {
      res.status(400).send({ error: `Unrecognized type: ${req.params.type}` })
      return
    }

    const metadata = this.snapshotManager.getSnapshotMetadata(type)

    if (!metadata) {
      res.status(503).send({ error: 'Snapshot not yet created' })
    } else {
      res.send(metadata)
    }
  }

  async addToDenylist(req: express.Request, res: express.Response) {
    // Method: PUT
    // Path: /denylist/{type}/{id}
    // Body: JSON with ethAddress, signature and timestamp

    const blocker: EthAddress = req.body.blocker
    const timestamp: Timestamp = req.body.timestamp
    const signature: Signature = req.body.signature
    let authChain: AuthChain = req.body.authChain

    const type = req.params.type
    const id = req.params.id

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

    const blocker: EthAddress = req.query.blocker
    const timestamp: Timestamp = req.query.timestamp
    const signature: Signature = req.query.signature

    const type = req.params.type
    const id = req.params.id

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

    const denylistTargets = await this.denylist.getAllDenylistedTargets()
    const controllerTargets: ControllerDenylistData[] = denylistTargets.map(({ target, metadata }) => ({
      target: target.asObject(),
      metadata
    }))
    res.send(controllerTargets)
  }

  async isTargetDenylisted(req: express.Request, res: express.Response) {
    // Method: HEAD
    // Path: /denylist/{type}/{id}

    const type = req.params.type
    const id = req.params.id

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
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata'
}

export enum DeploymentField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata',
  AUDIT_INFO = 'auditInfo'
}

export type ControllerPointerChanges = Omit<DeploymentPointerChanges, 'changes'> & {
  changes: {
    pointer: Pointer
    before: EntityId | undefined
    after: EntityId | undefined
  }[]
}

export type ControllerDenylistData = {
  target: {
    type: string
    id: string
  }
  metadata: {
    timestamp: Timestamp
    authChain: AuthChain
  }
}

export type ContentFile = {
  name: string
  path?: string
  content: Buffer
}

const DEFAULT_FIELDS_ON_DEPLOYMENTS: DeploymentField[] = [
  DeploymentField.POINTERS,
  DeploymentField.CONTENT,
  DeploymentField.METADATA
]
