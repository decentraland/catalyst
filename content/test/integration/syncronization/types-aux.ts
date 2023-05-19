import { hashV1 } from '@dcl/hashing'
import { AuthChain, ContentMapping, Entity, EntityType, Profile } from '@dcl/schemas'
import { IFetchComponent } from '@well-known-components/interfaces'

/**
 * Take all the entity's data, build the entity file with it, and calculate its id
 */
export async function buildEntityAndFile({
  type,
  pointers,
  timestamp,
  content,
  metadata
}: {
  type: EntityType
  pointers: string[]
  timestamp: number
  content: ContentMapping[]
  metadata?: any
}): Promise<{ entity: Entity; entityFile: Uint8Array }> {
  // Make sure that there is at least one pointer
  if (pointers.length === 0) throw new Error(`All entities must have at least one pointer.`)

  const entity = {
    // default version is V3
    version: 'v3',
    type,
    pointers,
    timestamp,
    content,
    metadata
  }

  // prevent duplicated file names
  if (content) {
    const usedFilenames = new Set<string>()
    for (const a of content) {
      const lowerCasedFileName = a.file.toLowerCase()
      if (usedFilenames.has(lowerCasedFileName)) {
        throw new Error(
          `Error creating the deployable entity: Decentraland's file system is case insensitive, the file ${JSON.stringify(
            a.file
          )} is repeated`
        )
      }
      usedFilenames.add(lowerCasedFileName)
    }
  }

  const entityFile = new TextEncoder().encode(JSON.stringify(entity))

  const entityId = await hashV1(entityFile)
  const entityWithId: Entity = {
    id: entityId,
    ...entity
  }

  if (!Entity.validate(entityWithId)) {
    throw new Error('Generated entity is not valid:\n' + Entity.validate.errors?.map(($) => $.message).join('\n'))
  }

  return { entity: entityWithId, entityFile }
}

/**
 * As part of the deployment process, an entity has to be built. In this method, we are building it, based on the data provided.
 * After the entity is built, the user will have to sign the entity id, to prove they are actually who they say they are.
 */
export async function buildEntity({
  type,
  pointers,
  files,
  metadata,
  timestamp
}: {
  type: EntityType
  pointers: string[]
  files?: Map<string, Uint8Array>
  metadata?: any
  timestamp?: number
}): Promise<DeploymentPreparationData> {
  // Reorder input
  const contentFiles = Array.from(files ? files : []).map(([key, content]) => ({
    key,
    content
  }))

  // Calculate hashes
  const allInfo = await Promise.all(
    contentFiles.map(async ({ key, content }) => ({ key, content, hash: await hashV1(content) }))
  )
  const hashesByKey: Map<string, string> = new Map(allInfo.map(({ hash, key }) => [key, hash]))
  const filesByHash: Map<string, Uint8Array> = new Map(allInfo.map(({ hash, content }) => [hash, content]))

  return buildEntityInternal(type, pointers, {
    hashesByKey,
    filesByHash,
    metadata,
    timestamp
  })
}

/**
 * In cases where we don't need upload content files, we can simply generate the new entity.
 * We can still use already uploaded hashes on this new entity.
 */
export async function buildEntityWithoutNewFiles(
  fetcher: IFetchComponent,
  {
    contentUrl,
    type,
    pointers,
    hashesByKey,
    metadata,
    timestamp
  }: {
    contentUrl: string
    type: EntityType
    pointers: string[]
    hashesByKey?: Map<string, string>
    metadata?: any
    timestamp?: number
  }
): Promise<DeploymentPreparationData> {
  const givenFilesMaps: Map<string, string> | undefined = hashesByKey ?? metadata ? getHashesByKey(metadata) : undefined
  // When the old entity has the old hashing algorithm, then the full entity with new hash will need to be deployed.
  if (!!givenFilesMaps && isObsoleteProfile(type, givenFilesMaps)) {
    const files = await downloadAllFiles(fetcher, contentUrl, givenFilesMaps)
    const metadataWithNewHash = await updateMetadata(files, metadata)
    return buildEntity({
      type,
      pointers,
      files,
      metadata: metadataWithNewHash,
      timestamp
    })
  }
  return buildEntityInternal(type, pointers, { hashesByKey, metadata, timestamp })
}

async function buildEntityInternal(
  type: EntityType,
  pointers: string[],
  options?: BuildEntityInternalOptions
): Promise<DeploymentPreparationData> {
  // Make sure that there is at least one pointer
  if (pointers.length === 0) {
    throw new Error(`All entities must have at least one pointer.`)
  }

  // Re-organize the hashes
  const hashesByKey: Map<string, string> = options?.hashesByKey ? options?.hashesByKey : new Map()
  const entityContent: ContentMapping[] = Array.from(hashesByKey.entries()).map(([key, hash]) => ({
    file: key,
    hash
  }))

  // Calculate timestamp if necessary
  const timestamp: number = options?.timestamp ? options?.timestamp : Date.now()

  // Build entity file
  const { entity, entityFile } = await buildEntityAndFile({
    type,
    pointers,
    timestamp,
    content: entityContent,
    metadata: options?.metadata
  })

  // Add entity file to content files
  const filesByHash: Map<string, Uint8Array> = options?.filesByHash ? options.filesByHash : new Map()
  filesByHash.set(entity.id, entityFile)

  return { files: filesByHash, entityId: entity.id }
}

type BuildEntityInternalOptions = {
  hashesByKey?: Map<string, string>
  filesByHash?: Map<string, Uint8Array>
  metadata?: any
  timestamp?: number
}

/** This data contains everything necessary for the user to sign, so that then a deployment can be executed */
export type DeploymentPreparationData = {
  entityId: string
  files: Map<string, Uint8Array>
}

export type DeploymentData = DeploymentPreparationData & {
  authChain: AuthChain
}

function isObsoleteProfile(type: EntityType, hashesByKey: Map<string, string>): boolean {
  return type === EntityType.PROFILE && Array.from(hashesByKey).some(([, hash]) => hash.toLowerCase().startsWith('qm'))
}

async function fetchArrayBuffer(fetcher: IFetchComponent, url: string) {
  const response = await fetcher.fetch(url)
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}

async function downloadAllFiles(
  fetcher: IFetchComponent,
  contentUrl: string,
  hashes: Map<string, string>
): Promise<Map<string, Uint8Array>> {
  const oldBodyHash = hashes.get('body.png')
  const oldFaceHash = hashes.get('face256.png')

  const bodyUrl = new URL(`${contentUrl}/contents/${oldBodyHash}`).toString()
  const faceUrl = new URL(`${contentUrl}/contents/${oldFaceHash}`).toString()

  const [bodyFileContent, faceFileContent] = await Promise.all([
    fetchArrayBuffer(fetcher, bodyUrl),
    fetchArrayBuffer(fetcher, faceUrl)
  ])

  return new Map([
    ['body.png', bodyFileContent],
    ['face256.png', faceFileContent]
  ])
}

async function updateMetadata(files: Map<string, Uint8Array>, metadata?: any) {
  if (!metadata) return metadata

  metadata.avatars = await Promise.all(
    (metadata as Profile).avatars.map(async (avatar) => {
      const newSnapshots = { face256: '', body: '' }

      const face256Content = files.get('face256.png')
      if (!!face256Content) {
        newSnapshots['face256'] = await hashV1(face256Content)
      }
      const bodyContent = files.get('body.png')
      if (!!bodyContent) {
        newSnapshots['body'] = await hashV1(bodyContent)
      }
      avatar.avatar.snapshots = newSnapshots
      return avatar
    })
  )

  return metadata
}

function getHashesByKey(metadata: any): Map<string, string> {
  const avatar = (metadata as Profile).avatars[0]
  return new Map([
    ['body.png', avatar.avatar.snapshots.body],
    ['face256.png', avatar.avatar.snapshots.face256]
  ])
}
