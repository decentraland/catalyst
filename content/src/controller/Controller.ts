import { toQueryParams } from '@catalyst/commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  ContentFileHash,
  Deployment,
  Entity,
  EntityId,
  EntityType,
  LegacyAuditInfo,
  Pointer,
  SortingField,
  SortingOrder,
  Timestamp
} from 'dcl-catalyst-commons'
import { AuthChain, Authenticator, AuthLink, EthAddress, Signature } from 'dcl-crypto'
import destroy from 'destroy'
import express from 'express'
import onFinished from 'on-finished'
import { CURRENT_CATALYST_VERSION, CURRENT_COMMIT_HASH, CURRENT_CONTENT_VERSION } from '../Environment'
import { getActiveDeploymentsByContentHash } from '../logic/database-queries/deployments-queries'
import { statusResponseFromComponents } from '../logic/status-checks'
import { ContentItem, RawContent } from '../ports/contentStorage/contentStorage'
import { getDeployments } from '../service/deployments/deployments'
import { DeploymentOptions } from '../service/deployments/types'
import { getPointerChanges } from '../service/pointers/pointers'
import { DeploymentPointerChanges, PointerChangesFilters } from '../service/pointers/types'
import {
  DeploymentContext,
  isInvalidDeployment,
  isSuccessfulDeployment,
  LocalDeploymentAuditInfo
} from '../service/Service'
import { AppComponents, parseEntityType } from '../types'
import { ControllerDeploymentFactory } from './ControllerDeploymentFactory'
import { ControllerEntityFactory } from './ControllerEntityFactory'

export class Controller {
  private static LOGGER: ILoggerComponent.ILogger

  constructor(
    private readonly components: Pick<
      AppComponents,
      | 'synchronizationManager'
      | 'snapshotManager'
      | 'deployer'
      | 'challengeSupervisor'
      | 'logs'
      | 'metrics'
      | 'database'
      | 'sequentialExecutor'
      | 'activeEntities'
      | 'denylist'
      | 'fs'
    >,
    private readonly ethNetwork: string
  ) {
    Controller.LOGGER = components.logs.getLogger('Controller')
  }

  /**
   * @deprecated
   * this endpoint will be deprecated in favor of `getActiveEntities`
   */
  async getEntities(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /entities/:type
    // Query String: ?{filter}&fields={fieldList}
    const type: EntityType = parseEntityType(req.params.type)
    const pointers: Pointer[] = this.asArray<Pointer>(req.query.pointer as string)?.map((p) => p.toLowerCase()) ?? []
    const ids: EntityId[] = this.asArray<EntityId>(req.query.id as string) ?? []
    const fields: string = req.query.fields as string

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
    const entities: Entity[] =
      ids.length > 0
        ? await this.components.activeEntities.withIds(ids)
        : await this.components.activeEntities.withPointers(pointers)

    const maskedEntities: Entity[] = entities.map((entity) => ControllerEntityFactory.maskEntity(entity, enumFields))
    res.send(maskedEntities)
  }

  async getActiveEntities(
    req: express.Request<unknown, unknown, { ids: string[]; pointers: string[] }>,
    res: express.Response
  ): Promise<void> {
    // Method: POST
    // Path: /entities/active
    // Body: { ids: string[], pointers: string[]}

    const ids: EntityId[] = req.body.ids
    const pointers: Pointer[] = req.body.pointers

    const idsPresent = ids?.length > 0
    const pointersPresent = pointers?.length > 0

    const bothPresent = idsPresent && pointersPresent
    const nonePresent = !idsPresent && !pointersPresent
    if (bothPresent || nonePresent) {
      res.status(400).send({ error: 'ids or pointers must be present, but not both' })
      return
    }

    const entities: Entity[] =
      ids && ids.length > 0
        ? await this.components.activeEntities.withIds(ids)
        : await this.components.activeEntities.withPointers(pointers)

    res.send(entities)
  }

  private asArray<T>(elements: any | T | T[]): T[] | undefined {
    if (!elements) {
      return undefined
    }
    if (elements instanceof Array) {
      return elements
    }
    return [elements]
  }

  async filterByUrn(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /entities/currently-pointed/{urnPrefix}
    const urnPrefix: string = parseEntityType(req.params.urnPrefix)

    const entities: { pointer: string; entityId: EntityId }[] = await this.components.activeEntities.withPrefix(
      urnPrefix
    )

    res.send(entities)
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
    const fixAttempt: boolean = req.query.fix === 'true'

    let deployFiles: ContentFile[] = []
    try {
      deployFiles = files ? await this.readFiles(files) : []
      const auditInfo: LocalDeploymentAuditInfo = this.buildAuditInfo(authChain, ethAddress, signature, entityId)

      const deploymentResult = await this.components.deployer.deployEntity(
        deployFiles.map(({ content }) => content),
        entityId,
        auditInfo,
        fixAttempt ? DeploymentContext.FIX_ATTEMPT : DeploymentContext.LOCAL
      )

      if (isSuccessfulDeployment(deploymentResult)) {
        this.components.metrics.increment('dcl_deployments_endpoint_counter', { kind: 'success' })
        res.send({ creationTimestamp: deploymentResult })
      } else if (isInvalidDeployment(deploymentResult)) {
        this.components.metrics.increment('dcl_deployments_endpoint_counter', { kind: 'validation_error' })
        Controller.LOGGER.error(`POST /entities - Deployment failed (${deploymentResult.errors.join(',')})`)
        res.status(400).send({ errors: deploymentResult.errors }).end()
      } else {
        Controller.LOGGER.error(`deploymentResult is invalid ${JSON.stringify(deploymentResult)}`)
        throw new Error('deploymentResult is invalid')
      }
    } catch (error) {
      this.components.metrics.increment('dcl_deployments_endpoint_counter', { kind: 'error' })
      Controller.LOGGER.error(`POST /entities - Internal server error '${error}'`, {
        entityId,
        authChain: JSON.stringify(authChain),
        ethAddress,
        signature
      })
      Controller.LOGGER.error(error)
      res.status(500).end()
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
      return await Promise.all(files.map((f) => this.readFile(f.path)))
    } else {
      return []
    }
  }

  private async readFile(path: string): Promise<ContentFile> {
    return { path, content: await this.components.fs.readFile(path) }
  }

  private async deleteUploadedFiles(deployFiles: ContentFile[]): Promise<void> {
    await Promise.all(
      deployFiles.map(async (deployFile) => {
        if (deployFile.path) {
          try {
            return await this.components.fs.unlink(deployFile.path)
          } catch (error) {
            // log and ignore errors
            console.error(error)
          }
        }
        return Promise.resolve()
      })
    )
  }

  async headContent(req: express.Request, res: express.Response): Promise<void> {
    // Method: HEAD
    // Path: /contents/:hashId
    const hashId = req.params.hashId

    const contentItem: ContentItem | undefined = await this.components.deployer.getContent(hashId)

    if (contentItem) {
      const rawStream = await contentItem.asRawStream()
      await setContentFileHeaders(rawStream, hashId, res)
      destroy(rawStream.stream)
      res.send()
    } else {
      res.status(404).send()
    }
  }

  async getContent(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /contents/:hashId
    const hashId = req.params.hashId

    const contentItem: ContentItem | undefined = await this.components.deployer.getContent(hashId)

    if (contentItem) {
      const rawStream = await contentItem.asRawStream()
      await setContentFileHeaders(rawStream, hashId, res)

      const { stream } = rawStream
      stream.pipe(res)

      // Note: for context about why this is necessary, check https://github.com/nodejs/node/issues/1180
      onFinished(res, () => destroy(stream))
    } else {
      res.status(404).send()
    }
  }

  async getAvailableContent(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /available-content
    // Query String: ?cid={hashId1}&cid={hashId2}
    const cids = this.asArray<ContentFileHash>(req.query.cid)

    if (!cids) {
      res.status(400).send('Please set at least one cid.')
    } else {
      const availableCids = cids.filter((cid) => !this.components.denylist.isDenyListed(cid))
      const availableContent = await this.components.deployer.isContentAvailable(availableCids)
      res.send(
        Array.from(availableContent.entries()).map(([fileHash, isAvailable]) => ({
          cid: fileHash,
          available: isAvailable
        }))
      )
    }
  }

  async getAudit(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /audit/:type/:entityId
    const type = parseEntityType(req.params.type)
    const entityId = req.params.entityId

    // Validate type is valid
    if (!type) {
      res.status(400).send({ error: `Unrecognized type: ${req.params.type}` })
      return
    }

    const { deployments } = await getDeployments(this.components, {
      fields: [DeploymentField.AUDIT_INFO],
      filters: { entityIds: [entityId], entityTypes: [type], includeOverwrittenInfo: true },
      includeDenylisted: true
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

  async getPointerChanges(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /pointer-changes
    // Query String: ?from={timestamp}&to={timestamp}&offset={number}&limit={number}&entityType={entityType}&includeAuthChain={boolean}
    const stringEntityTypes = this.asArray<string>(req.query.entityType)
    const entityTypes: (EntityType | undefined)[] | undefined = stringEntityTypes
      ? stringEntityTypes.map((type) => parseEntityType(type))
      : undefined
    const from: Timestamp | undefined = this.asInt(req.query.from)
    const to: Timestamp | undefined = this.asInt(req.query.to)
    const offset: number | undefined = this.asInt(req.query.offset)
    const limit: number | undefined = this.asInt(req.query.limit)
    const lastId: string | undefined = (req.query.lastId as string)?.toLowerCase()
    const includeAuthChain = this.asBoolean(req.query.includeAuthChain) ?? false

    const sortingFieldParam: string | undefined = req.query.sortingField as string
    const snake_case_sortingField = sortingFieldParam ? this.fromCamelCaseToSnakeCase(sortingFieldParam) : undefined
    const sortingField: SortingField | undefined | 'unknown' = this.asEnumValue(SortingField, snake_case_sortingField)
    const sortingOrder: SortingOrder | undefined | 'unknown' = this.asEnumValue(
      SortingOrder,
      req.query.sortingOrder as string
    )

    // Validate type is valid
    if (entityTypes && entityTypes.some((type) => !type)) {
      res.status(400).send({ error: `Found an unrecognized entity type` })
      return
    }

    if (offset && offset > 5000) {
      res
        .status(400)
        .send({ error: `Offset can't be higher than 5000. Please use the 'next' property for pagination.` })
      return
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
      entityTypes: entityTypes as EntityType[] | undefined,
      from,
      to,
      includeAuthChain,
      includeOverwrittenInfo: includeAuthChain
    }

    const {
      pointerChanges: deltas,
      filters,
      pagination
    } = await this.components.sequentialExecutor.run('GetPointerChangesEndpoint', () =>
      getPointerChanges(this.components, {
        filters: requestFilters,
        offset,
        limit,
        lastId,
        sortBy
      })
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

  private calculateNextRelativePathForPointer(
    lastPointerChange: ControllerPointerChanges,
    limit: number,
    filters?: PointerChangesFilters
  ): string | undefined {
    const nextFilters = Object.assign({}, filters)
    // It will always use toLocalTimestamp as this endpoint is always sorted with the default config: local and DESC
    nextFilters.to = lastPointerChange.localTimestamp

    const nextQueryParams = toQueryParams({
      ...nextFilters,

      limit: limit,
      lastId: lastPointerChange.entityId
    })
    return '?' + nextQueryParams
  }

  async getActiveDeploymentsByContentHash(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /contents/:hashId/active-entities
    const hashId = req.params.hashId

    let result = await getActiveDeploymentsByContentHash(this.components, hashId)
    result = result.filter((entityId) => !this.components.denylist.isDenyListed(entityId))

    if (result.length === 0) {
      res.status(404).send({ error: 'The entity was not found' })
      return
    }

    res.json(result)
  }

  async getDeployments(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /deployments
    // Query String: ?from={timestamp}&toLocalTimestamp={timestamp}&entityType={entityType}&entityId={entityId}&onlyCurrentlyPointed={boolean}

    const stringEntityTypes = this.asArray<string>(req.query.entityType as string | string[])
    const entityTypes: (EntityType | undefined)[] | undefined = stringEntityTypes
      ? stringEntityTypes.map((type) => parseEntityType(type))
      : undefined
    const entityIds: EntityId[] | undefined = this.asArray<EntityId>(req.query.entityId)
    const onlyCurrentlyPointed: boolean | undefined = this.asBoolean(req.query.onlyCurrentlyPointed)
    const pointers: Pointer[] | undefined = this.asArray<Pointer>(req.query.pointer)?.map((p) => p.toLowerCase())
    const offset: number | undefined = this.asInt(req.query.offset)
    const limit: number | undefined = this.asInt(req.query.limit)
    const fields: string | undefined = req.query.fields as string | undefined
    const sortingFieldParam: string | undefined = req.query.sortingField as string
    const snake_case_sortingField = sortingFieldParam ? this.fromCamelCaseToSnakeCase(sortingFieldParam) : undefined
    const sortingField: SortingField | undefined | 'unknown' = this.asEnumValue(SortingField, snake_case_sortingField)
    const sortingOrder: SortingOrder | undefined | 'unknown' = this.asEnumValue(
      SortingOrder,
      req.query.sortingOrder as string
    )
    const lastId: string | undefined = (req.query.lastId as string)?.toLowerCase()
    const from: number | undefined = this.asInt(req.query.from)
    const to: number | undefined = this.asInt(req.query.to)

    // Validate type is valid
    if (entityTypes && entityTypes.some((type) => !type)) {
      res.status(400).send({ error: `Found an unrecognized entity type` })
      return
    }

    if (offset && offset > 5000) {
      res
        .status(400)
        .send({ error: `Offset can't be higher than 5000. Please use the 'next' property for pagination.` })
      return
    }

    // Validate fields are correct or empty
    let enumFields: DeploymentField[] = DEFAULT_FIELDS_ON_DEPLOYMENTS
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

    const requestFilters = {
      pointers,
      entityTypes: entityTypes as EntityType[],
      entityIds,
      onlyCurrentlyPointed,
      from,
      to
    }

    const deploymentOptions = {
      fields: enumFields,
      filters: requestFilters,
      sortBy: sortBy,
      offset: offset,
      limit: limit,
      lastId: lastId
    }

    const { deployments, filters, pagination } = await this.components.sequentialExecutor.run(
      'GetDeploymentsEndpoint',
      () => getDeployments(this.components, deploymentOptions)
    )
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
      } else {
        nextFilters.to = lastDeployment.auditInfo.localTimestamp
      }
    } else {
      if (order == SortingOrder.ASCENDING) {
        nextFilters.from = lastDeployment.entityTimestamp
      } else {
        nextFilters.to = lastDeployment.entityTimestamp
      }
    }

    const fields = !options.fields || options.fields === DEFAULT_FIELDS_ON_DEPLOYMENTS ? '' : options.fields.join(',')

    const nextQueryParams = toQueryParams({
      ...nextFilters,
      fields,
      sortingField: field,
      sortingOrder: order,
      lastId: lastDeployment.entityId,
      limit: options?.limit
    })
    return '?' + nextQueryParams
  }

  private fromCamelCaseToSnakeCase(phrase: string): string {
    const withoutUpperCase: string = phrase.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    if (withoutUpperCase[0] === '_') {
      return withoutUpperCase.substring(1)
    }
    return withoutUpperCase
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

  async getStatus(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /status

    const serverStatus = await statusResponseFromComponents(this.components)

    res.status(serverStatus.successful ? 200 : 503)

    res.send({
      ...serverStatus.details,
      version: CURRENT_CONTENT_VERSION,
      commitHash: CURRENT_COMMIT_HASH,
      catalystVersion: CURRENT_CATALYST_VERSION,
      ethNetwork: this.ethNetwork
    })
  }

  /**
   * @deprecated
   */
  async getSnapshot(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /snapshot/:type

    const type = parseEntityType(req.params.type)

    // Validate type is valid
    if (!type) {
      res.status(400).send({ error: `Unrecognized type: ${req.params.type}` })
      return
    }

    const metadata = this.components.snapshotManager.getSnapshotMetadataPerEntityType(type)

    if (!metadata) {
      res.status(503).send({ error: 'Snapshot not yet created' })
    } else {
      res.send(metadata)
    }
  }

  async getAllSnapshots(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /snapshot

    const metadata = this.components.snapshotManager.getFullSnapshotMetadata()

    if (!metadata) {
      res.status(503).send({ error: 'Snapshot not yet created' })
    } else {
      res.send(metadata)
    }
  }

  async getFailedDeployments(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /failed-deployments

    const failedDeployments = await this.components.deployer.getAllFailedDeployments()
    res.send(failedDeployments)
  }

  async getChallenge(req: express.Request, res: express.Response): Promise<void> {
    // Method: GET
    // Path: /challenge

    const challengeText = this.components.challengeSupervisor.getChallengeText()
    res.send({ challengeText })
  }
}

async function setContentFileHeaders(content: RawContent, hashId: string, res: express.Response) {
  res.contentType('application/octet-stream')
  res.setHeader('ETag', JSON.stringify(hashId)) // by spec, the ETag must be a double-quoted string
  res.setHeader('Access-Control-Expose-Headers', 'ETag')
  res.setHeader('Cache-Control', 'public,max-age=31536000,s-maxage=31536000,immutable')

  if (content.encoding) {
    res.setHeader('Content-Encoding', content.encoding)
  }

  if (content.size) {
    res.setHeader('Content-Length', content.size.toString())
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

type ContentFile = {
  path?: string
  content: Buffer
}

const DEFAULT_FIELDS_ON_DEPLOYMENTS: DeploymentField[] = [
  DeploymentField.POINTERS,
  DeploymentField.CONTENT,
  DeploymentField.METADATA
]
