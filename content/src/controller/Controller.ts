import {
  ContentFileHash,
  Entity as ControllerEntity,
  EntityId,
  EntityType,
  EntityVersion,
  LegacyAuditInfo,
  PartialDeploymentHistory,
  Pointer,
  SortingField,
  SortingOrder,
  Timestamp
} from 'dcl-catalyst-commons'
import { AuthChain, Authenticator, AuthLink, EthAddress, Signature } from 'dcl-crypto'
import {
  toQueryParamsForGetAllDeployments,
  toQueryParamsForPointerChanges
} from 'decentraland-katalyst-commons/QueryParameters'
import destroy from 'destroy'
import express from 'express'
import fs from 'fs'
import log4js from 'log4js'
import onFinished from 'on-finished'
import { Denylist, DenylistSignatureValidationResult, isSuccessfulOperation } from '../denylist/Denylist'
import { parseDenylistTypeAndId } from '../denylist/DenylistTarget'
import { CURRENT_CATALYST_VERSION, CURRENT_COMMIT_HASH, CURRENT_CONTENT_VERSION } from '../Environment'
import { ContentAuthenticator } from '../service/auth/Authenticator'
import {
  Deployment,
  DeploymentOptions,
  DeploymentPointerChanges,
  PointerChangesFilters
} from '../service/deployments/DeploymentManager'
import {
  DeploymentResult,
  isSuccessfulDeployment,
  LocalDeploymentAuditInfo,
  MetaverseContentService
} from '../service/Service'
import { SnapshotManager } from '../service/snapshots/SnapshotManager'
import { ChallengeSupervisor } from '../service/synchronization/ChallengeSupervisor'
import { SynchronizationManager } from '../service/synchronization/SynchronizationManager'
import { ContentItem } from '../storage/ContentStorage'
import { ControllerDeploymentFactory } from './ControllerDeploymentFactory'
import { ControllerEntityFactory } from './ControllerEntityFactory'

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

    let deployFiles: ContentFile[] = []
    try {
      deployFiles = await this.readFiles(files)
      const auditInfo: LocalDeploymentAuditInfo = {
        authChain,
        version: CURRENT_CONTENT_VERSION,
        migrationData: {
          originalVersion,
          data: migrationInformation
        }
      }

      const deploymentResult: DeploymentResult = await this.service.deployLocalLegacy(deployFiles, entityId, auditInfo)

      if (isSuccessfulDeployment(deploymentResult)) {
        res.send({ creationTimestamp: deploymentResult })
      } else {
        Controller.LOGGER.warn(`Returning error '${deploymentResult.errors.join('\n')}'`)
        res.status(400).send(deploymentResult.errors.join('\n'))
      }
    } catch (error) {
      Controller.LOGGER.warn(`Returning error '${error.message}'`)
      res.status(500).send(error.message)
    } finally {
      await this.deleteUploadedFiles(deployFiles)
    }
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

    let deployFiles: ContentFile[] = []
    try {
      deployFiles = await this.readFiles(files)
      const auditInfo: LocalDeploymentAuditInfo = this.buildAuditInfo(authChain, ethAddress, signature, entityId)

      let deploymentResult: DeploymentResult = { errors: [] }
      if (fixAttempt) {
        deploymentResult = await this.service.deployToFix(deployFiles, entityId, auditInfo, origin)
      } else {
        deploymentResult = await this.service.deployEntity(deployFiles, entityId, auditInfo, origin)
      }

      if (isSuccessfulDeployment(deploymentResult)) {
        res.send({ creationTimestamp: deploymentResult })
      } else {
        Controller.LOGGER.warn(`Returning error '${deploymentResult.errors.join('\n')}'`)
        res.status(400).send(deploymentResult.errors.join('\n'))
      }
    } catch (error) {
      Controller.LOGGER.warn(`Returning error '${error.message}'`)
      res.status(500).send(error.message)
    } finally {
      await this.deleteUploadedFiles(deployFiles)
    }
  }

  private buildAuditInfo(authChain: AuthLink[], ethAddress: string, signature: string, entityId: string) {
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
      const stream = data.asStream()
      stream.pipe(res)

      // Note: for context about why this is necessary, check https://github.com/nodejs/node/issues/1180
      onFinished(res, () => destroy(stream))
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
        deployedTimestamp: auditInfo.localTimestamp,
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

  async getPointerChanges(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /pointerChanges
    // Query String: ?fromLocalTimestamp={timestamp}&toLocalTimestamp={timestamp}&offset={number}&limit={number}&entityType={entityType}
    const stringEntityTypes = this.asArray<string>(req.query.entityType)
    const entityTypes: (EntityType | undefined)[] | undefined = stringEntityTypes
      ? stringEntityTypes.map((type) => this.parseEntityType(type))
      : undefined
    //deprecated
    const fromLocalTimestamp: Timestamp | undefined = this.asInt(req.query.fromLocalTimestamp)
    // deprecated
    const toLocalTimestamp: Timestamp | undefined = this.asInt(req.query.toLocalTimestamp)
    const from: Timestamp | undefined = this.asInt(req.query.from)
    const to: Timestamp | undefined = this.asInt(req.query.to)
    const offset: number | undefined = this.asInt(req.query.offset)
    const limit: number | undefined = this.asInt(req.query.limit)
    const lastId: string | undefined = req.query.lastId?.toLowerCase()

    // Validate type is valid
    if (entityTypes && entityTypes.some((type) => !type)) {
      res.status(400).send({ error: `Found an unrecognized entity type` })
      return
    }

    // TODO: remove this when to/from localTimestamp parameter is deprecated to use to/from
    const fromFilter = from ?? fromLocalTimestamp
    const toFilter = to ?? toLocalTimestamp

    const requestFilters = {
      entityTypes: entityTypes as EntityType[] | undefined,
      from: fromFilter,
      to: toFilter
    }
    const { pointerChanges: deltas, filters, pagination } = await this.service.getPointerChanges(
      requestFilters,
      offset,
      limit,
      lastId
    )
    const controllerPointerChanges: ControllerPointerChanges[] = deltas.map((delta) => ({
      ...delta,
      changes: Array.from(delta.changes.entries()).map(([pointer, { before, after }]) => ({ pointer, before, after }))
    }))

    if (controllerPointerChanges.length > 0 && pagination.moreData) {
      const lastPointerChange = controllerPointerChanges[controllerPointerChanges.length - 1]
      pagination.next = this.calculateNextRelativePathForPointer(lastPointerChange, pagination.limit, filters)
    }

    res.send({ deltas: controllerPointerChanges, filters, pagination })
  }

  calculateNextRelativePathForPointer(
    lastPointerChange: ControllerPointerChanges,
    limit: number,
    filters?: PointerChangesFilters
  ): string | undefined {
    const nextFilters = Object.assign({}, filters)
    // It will always use toLocalTimestamp as this endpoint is always sorted with the default config: local and DESC
    const to = lastPointerChange.localTimestamp
    const from = nextFilters.from
    const entityTypes = nextFilters.entityTypes

    const nextQueryParams = toQueryParamsForPointerChanges(to, entityTypes, limit, lastPointerChange.entityId, from)
    return '?' + nextQueryParams
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
    const onlyCurrentlyPointed: boolean | undefined = this.asBoolean(req.query.onlyCurrentlyPointed)
    const deployedBy: EthAddress[] | undefined = this.asArray<EthAddress>(req.query.deployedBy)?.map((p) =>
      p.toLowerCase()
    )
    const pointers: Pointer[] | undefined = this.asArray<Pointer>(req.query.pointer)?.map((p) => p.toLowerCase())
    const offset: number | undefined = this.asInt(req.query.offset)
    const limit: number | undefined = this.asInt(req.query.limit)
    const fields: string | undefined = req.query.fields
    const sortingField: SortingField | undefined | 'unknown' = this.asEnumValue(SortingField, req.query.sortingField)
    const sortingOrder: SortingOrder | undefined | 'unknown' = this.asEnumValue(SortingOrder, req.query.sortingOrder)
    const lastId: string | undefined = req.query.lastId?.toLowerCase()
    // deprecated
    const fromLocalTimestamp: number | undefined = this.asInt(req.query.fromLocalTimestamp)
    // deprecated
    const toLocalTimestamp: number | undefined = this.asInt(req.query.toLocalTimestamp)
    const from: number | undefined = this.asInt(req.query.from)
    const to: number | undefined = this.asInt(req.query.to)

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

    // TODO: remove this when to/from localTimestamp parameter is deprecated to use to/from
    const fromFilter =
      (!sortingField || sortingField == SortingField.LOCAL_TIMESTAMP) && fromLocalTimestamp ? fromLocalTimestamp : from
    const toFilter =
      (!sortingField || sortingField == SortingField.LOCAL_TIMESTAMP) && toLocalTimestamp ? toLocalTimestamp : to

    const requestFilters = {
      pointers,
      entityTypes: entityTypes as EntityType[],
      entityIds,
      deployedBy,
      onlyCurrentlyPointed,
      from: fromFilter,
      to: toFilter
    }

    const deploymentOptions = {
      filters: requestFilters,
      sortBy: sortBy,
      offset: offset,
      limit: limit,
      lastId: lastId
    }
    const { deployments, filters, pagination } = await this.service.getDeployments(deploymentOptions)
    const controllerDeployments = deployments.map((deployment) =>
      ControllerDeploymentFactory.deployment2ControllerEntity(deployment, enumFields)
    )

    if (deployments.length > 0 && pagination.moreData) {
      const lastDeployment = deployments[deployments.length - 1]
      pagination.next = this.calculateNextRelativePath(deploymentOptions, lastDeployment)
    }

    res.send({ deployments: controllerDeployments, filters, pagination })
  }

  private calculateNextRelativePath(options: DeploymentOptions, lastDeployment: Deployment): string {
    const nextFilters = Object.assign({}, options?.filters)

    const field = options?.sortBy?.field ?? SortingField.LOCAL_TIMESTAMP
    const order = options?.sortBy?.order ?? SortingOrder.DESCENDING

    if (field == SortingField.LOCAL_TIMESTAMP) {
      if (order == SortingOrder.ASCENDING) {
        nextFilters.from = lastDeployment.auditInfo.localTimestamp
        nextFilters.to = nextFilters.to ?? nextFilters.toLocalTimestamp
      } else {
        nextFilters.to = lastDeployment.auditInfo.localTimestamp
        nextFilters.from = nextFilters.from ?? nextFilters.fromLocalTimestamp
      }
    } else {
      if (order == SortingOrder.ASCENDING) {
        nextFilters.from = lastDeployment.entityTimestamp
      } else {
        nextFilters.to = lastDeployment.entityTimestamp
      }
    }
    // TODO: remove this when to/from localTimestamp is removed
    nextFilters.fromLocalTimestamp = undefined
    nextFilters.toLocalTimestamp = undefined

    const nextQueryParams = toQueryParamsForGetAllDeployments(
      nextFilters,
      field,
      order,
      lastDeployment.entityId,
      options?.limit
    )
    return '?' + nextQueryParams
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
      catalystVersion: CURRENT_CATALYST_VERSION,
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

  async addToDenylist(req: express.Request, res: express.Response): Promise<void> {
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
      const messageToSign = Denylist.buildBlockMessageToSign(target, timestamp)
      authChain = ContentAuthenticator.createSimpleAuthChain(messageToSign, blocker, signature)
    }

    try {
      const result: DenylistSignatureValidationResult = await this.denylist.addTarget(target, { timestamp, authChain })
      if (isSuccessfulOperation(result)) {
        res.status(201).send()
      } else {
        res.status(400).send(result.message)
      }
    } catch (error) {
      res.status(500).send(error.message)
    }
  }

  async removeFromDenylist(req: express.Request, res: express.Response): Promise<void> {
    // Method: DELETE
    // Path: /denylist/{type}/{id}
    // Query String: ?blocker={ethAddress}&timestamp={timestamp}&signature={signature}

    const blocker: EthAddress = req.query.blocker
    const timestamp: Timestamp = req.query.timestamp
    const signature: Signature = req.query.signature

    const type = req.params.type
    const id = req.params.id

    const target = parseDenylistTypeAndId(type, id)
    const messageToSign = Denylist.buildUnblockMessageToSign(target, timestamp)
    const authChain: AuthChain = ContentAuthenticator.createSimpleAuthChain(messageToSign, blocker, signature)

    try {
      const result: DenylistSignatureValidationResult = await this.denylist.removeTarget(target, {
        timestamp,
        authChain
      })
      if (isSuccessfulOperation(result)) {
        res.status(200).send()
      } else {
        res.status(400).send(result.message)
      }
    } catch (error) {
      res.status(500).send(error.message)
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
