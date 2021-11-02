import { Locale, Rarity, Wearable, WearableBodyShape, WearableCategory, WearableRepresentation } from '@dcl/schemas'
import { AuditInfo, EntityType, EntityVersion, Hashing, Pointer, Timestamp } from 'dcl-catalyst-commons'
import * as EthCrypto from 'eth-crypto'
import ms from 'ms'
import sharp from 'sharp'
import { ContentAuthenticator } from '../../../../src/service/auth/Authenticator'
import { Deployment } from '../../../../src/service/deployments/DeploymentManager'
import { Entity } from '../../../../src/service/Entity'
import { NoFailure } from '../../../../src/service/errors/FailedDeploymentsManager'
import { DEFAULT_THUMBNAIL_SIZE, Validations } from '../../../../src/service/validations/Validations'
import {
  DeploymentToValidate,
  ExternalCalls,
  ServerEnvironment,
  ValidationArgs
} from '../../../../src/service/validations/Validator'
import { MockedAccessChecker } from '../../../helpers/service/access/MockedAccessChecker'
const avatarInfo = {
  bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
  snapshots: {
    face: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5q',
    face128: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5r',
    face256: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s',
    body: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
  },
  eyes: { color: { r: 0.23046875, g: 0.625, b: 0.3125 } },
  hair: { color: { r: 0.35546875, g: 0.19140625, b: 0.05859375 } },
  skin: { color: { r: 0.94921875, g: 0.76171875, b: 0.6484375 } },
  wearables: [
    'urn:decentraland:off-chain:base-avatars:tall_front_01',
    'urn:decentraland:off-chain:base-avatars:eyes_08',
    'urn:decentraland:off-chain:base-avatars:eyebrows_00',
    'urn:decentraland:off-chain:base-avatars:mouth_05',
    'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0',
    'urn:decentraland:off-chain:base-avatars:classic_shoes',
    'urn:decentraland:off-chain:base-avatars:red_tshirt',
    'urn:decentraland:off-chain:base-avatars:trash_jean'
  ]
}

const avatar = {
  userId: '0x87956abc4078a0cc3b89b419628b857b8af826ed',
  email: 'some@email.com',
  name: 'Some Name',
  hasClaimedName: true,
  description: 'Some Description',
  ethAddress: '0x87956abC4078a0Cc3b89b419628b857B8AF826Ed',
  version: 44,
  avatar: avatarInfo,
  tutorialStep: 355,
  interests: []
}

export const VALID_PROFILE_METADATA = { avatars: [avatar] }

const representation: WearableRepresentation = {
  bodyShapes: [WearableBodyShape.FEMALE],
  mainFile: 'file1',
  contents: ['file1', 'file2'],
  overrideHides: [],
  overrideReplaces: []
}

const wearable: Wearable = {
  id: 'some id',
  descriptions: [
    {
      code: Locale.EN,
      text: 'some description'
    },
    {
      code: Locale.ES,
      text: 'una descripcion'
    }
  ],
  collectionAddress: '0x...',
  rarity: Rarity.LEGENDARY,
  names: [
    {
      code: Locale.EN,
      text: 'name'
    }
  ],
  data: {
    replaces: [],
    hides: [],
    tags: ['tag1'],
    representations: [representation],
    category: WearableCategory.UPPER_BODY
  },
  thumbnail: 'thumbnail.png',
  image: 'image.png'
}

function buildEntityV4(type = EntityType.PROFILE, metadata = {}) {
  return {
    ...buildEntity(),
    version: EntityVersion.V4,
    metadata,
    type
  }
}

function buildEntity(options?: {
  version?: EntityVersion
  id?: string
  timestamp?: Timestamp
  content?: Map<string, string>
  pointers?: Pointer[]
}) {
  const opts = Object.assign(
    {
      version: EntityVersion.V3,
      timestamp: Date.now(),
      content: undefined,
      id: 'bafybeihz4c4cf4icnlh6yjtt7fooaeih3dkv2mz6umod7dybenzmsxkzvq',
      pointers: ['P1'],
      type: EntityType.SCENE
    },
    options
  )
  return opts
}

function getFileWithSize(sizeInMB: number, hash = 'someHash') {
  return new Map([[hash, Buffer.alloc(sizeInMB * 1024 * 1024)]])
}

async function assertSignatureInInvalid(result: undefined | string[] | Promise<undefined | string[]>) {
  const actualErrors = await result
  expect(actualErrors).toBeDefined()
  expect(actualErrors?.length).toBe(1)
  expect(actualErrors?.[0]).toMatch('The signature is invalid.*')
}

function deploymentWith(entity: Entity, auditInfo: Partial<AuditInfo>) {
  const deployment: Deployment = {
    ...entity,
    entityVersion: EntityVersion.V3,
    entityId: entity.id,
    entityTimestamp: entity.timestamp,
    entityType: entity.type,
    deployedBy: '0x...',
    content: undefined,
    auditInfo: {
      version: EntityVersion.V3,
      authChain: [],
      localTimestamp: 20,
      ...auditInfo
    }
  }
  return { deployments: [deployment] }
}

async function assertErrorsWere(
  result: undefined | string[] | Promise<undefined | string[]>,
  ...expectedErrors: string[]
) {
  const actualErrors = await result
  expect(actualErrors).toBeDefined()
  expect(actualErrors).toEqual(expectedErrors)
}

async function assertNoErrors(
  result: undefined | string[] | Promise<undefined | string[]>,
  ...expectedErrors: string[]
) {
  const actualErrors = await result
  expect(actualErrors).toBeUndefined()
}

function buildArgs(args: {
  deployment: Pick<DeploymentToValidate, 'entity'> & Partial<DeploymentToValidate>
  env?: Partial<ServerEnvironment>
  externalCalls?: Partial<ExternalCalls>
}): ValidationArgs {
  return {
    deployment: {
      files: new Map(),
      auditInfo: { authChain: [] },
      ...args.deployment
    },
    env: {
      accessChecker: new MockedAccessChecker(),
      authenticator: new ContentAuthenticator('ropsten'),
      requestTtlBackwards: ms('10m'),
      maxUploadSizePerTypeInMB: new Map(),
      ...args?.env
    },
    externalCalls: {
      fetchDeployments: () => Promise.resolve({ deployments: [] }),
      areThereNewerEntities: () => Promise.resolve(false),
      fetchDeploymentStatus: () => Promise.resolve(NoFailure.NOT_MARKED_AS_FAILED),
      isContentStoredAlready: (hashes) => Promise.resolve(new Map(hashes.map((hash) => [hash, false]))),
      isEntityDeployedAlready: () => Promise.resolve(false),
      isEntityRateLimited: () => Promise.resolve(false),
      fetchContentFileSize: () => Promise.resolve(0),
      ...args?.externalCalls
    }
  }
}

describe('Validations', function () {
  describe('Recent', () => {
    it(`When an entity with a timestamp too far into the past is deployed, then an error is returned`, async () => {
      const entity = buildEntity({ timestamp: Date.now() - ms('25m') })
      const args = buildArgs({ deployment: { entity } })

      const result = Validations.RECENT(args)

      await assertErrorsWere(result, 'The request is not recent enough, please submit it again with a new timestamp.')
    })

    it(`When an entity with a timestamp too far into the future is deployed, then an error is returned`, async () => {
      const entity = buildEntity({ timestamp: Date.now() + ms('20m') })
      const args = buildArgs({ deployment: { entity } })

      const result = Validations.RECENT(args)

      await assertErrorsWere(
        result,
        'The request is too far in the future, please submit it again with a new timestamp.'
      )
    })

    it(`When an entity with the correct timestamp is deployed, then no error is returned`, async () => {
      const entity = buildEntity({ timestamp: Date.now() })
      const args = buildArgs({ deployment: { entity } })

      const result = Validations.RECENT(args)

      await assertNoErrors(result)
    })
  })

  describe('Legacy entity', () => {
    const LEGACY_AUDIT_INFO = {
      version: EntityVersion.V3,
      deployedTimestamp: 10,
      authChain: [],
      migrationData: {
        // This is used for migrations
        originalVersion: EntityVersion.V2,
        data: 'data'
      }
    }

    const LEGACY_ENTITY = buildEntity({ timestamp: 1000 })

    it(`When a legacy entity is deployed and there is no entity, then no error is returned`, async () => {
      const args = buildArgs({ deployment: { entity: LEGACY_ENTITY, auditInfo: LEGACY_AUDIT_INFO } })

      const result = Validations.LEGACY_ENTITY(args)

      await assertNoErrors(result)
    })

    it(`When a legacy entity is deployed and there is an entity with a higher timestamp, then no error is returned`, async () => {
      const entity = buildEntity({ timestamp: 1001 })
      const auditInfo = {
        version: EntityVersion.V3,
        deployedTimestamp: 10,
        authChain: []
      }
      const args = buildArgs({
        deployment: { entity: LEGACY_ENTITY, auditInfo: LEGACY_AUDIT_INFO },
        externalCalls: { fetchDeployments: () => Promise.resolve(deploymentWith(entity, auditInfo)) }
      })

      const result = Validations.LEGACY_ENTITY(args)

      await assertNoErrors(result)
    })

    it(`When a legacy entity is deployed and there is a previous entity with a higher version, then an error is returned`, async () => {
      const entity = buildEntity({ timestamp: 999 })
      const legacyAuditInfo = { ...LEGACY_AUDIT_INFO, version: EntityVersion.V2 }
      const auditInfo = {
        version: EntityVersion.V3,
        authChain: []
      }
      const args = buildArgs({
        deployment: { entity: LEGACY_ENTITY, auditInfo: legacyAuditInfo },
        externalCalls: { fetchDeployments: () => Promise.resolve(deploymentWith(entity, auditInfo)) }
      })

      const result = Validations.LEGACY_ENTITY(args)

      await assertErrorsWere(result, `Found an overlapping entity with a higher version already deployed.`)
    })

    it(`When a legacy entity is deployed and there is a previous entity with a lower version, then no error is returned`, async () => {
      const entity = buildEntity({ timestamp: 999 })
      const auditInfo = {
        version: EntityVersion.V2,
        deployedTimestamp: 10,
        authChain: []
      }
      const args = buildArgs({
        deployment: { entity: LEGACY_ENTITY, auditInfo: LEGACY_AUDIT_INFO },
        externalCalls: { fetchDeployments: () => Promise.resolve(deploymentWith(entity, auditInfo)) }
      })

      const result = Validations.LEGACY_ENTITY(args)

      await assertNoErrors(result)
    })

    it(`When a legacy entity is deployed and there is a previous entity without original metadata, then an error is returned`, async () => {
      const entity = buildEntity({ timestamp: 999 })
      const auditInfo = {
        version: EntityVersion.V3,
        authChain: []
      }
      const args = buildArgs({
        deployment: { entity: LEGACY_ENTITY, auditInfo: LEGACY_AUDIT_INFO },
        externalCalls: { fetchDeployments: () => Promise.resolve(deploymentWith(entity, auditInfo)) }
      })

      const result = Validations.LEGACY_ENTITY(args)

      await assertErrorsWere(result, `Found an overlapping entity with a higher version already deployed.`)
    })

    it(`When a legacy entity is deployed and there is a previous entity with a higher original version, then an error is returned`, async () => {
      const entity = buildEntity({ timestamp: 999 })
      const auditInfo = {
        version: EntityVersion.V3,
        deployedTimestamp: 10,
        authChain: [],
        originalMetadata: {
          originalVersion: EntityVersion.V3,
          data: 'data'
        }
      }
      const args = buildArgs({
        deployment: { entity: LEGACY_ENTITY, auditInfo: LEGACY_AUDIT_INFO },
        externalCalls: { fetchDeployments: () => Promise.resolve(deploymentWith(entity, auditInfo)) }
      })

      const result = Validations.LEGACY_ENTITY(args)

      await assertErrorsWere(result, `Found an overlapping entity with a higher version already deployed.`)
    })

    it(`When a legacy entity is deployed and there is a previous entity with the same original version, then no error is returned`, async () => {
      const entity = buildEntity({ timestamp: 999 })
      const auditInfo = {
        version: EntityVersion.V3,
        deployedTimestamp: 10,
        authChain: [],
        migrationData: {
          originalVersion: EntityVersion.V2,
          data: 'data'
        }
      }
      const args = buildArgs({
        deployment: { entity: LEGACY_ENTITY, auditInfo: LEGACY_AUDIT_INFO },
        externalCalls: { fetchDeployments: () => Promise.resolve(deploymentWith(entity, auditInfo)) }
      })

      const result = Validations.LEGACY_ENTITY(args)

      await assertNoErrors(result)
    })
  })

  describe('Content', () => {
    it(`When a hash that was not uploaded and not present is referenced, it is reported`, async () => {
      const entity = buildEntity({
        content: new Map([['name', 'hash']])
      })
      const args = buildArgs({ deployment: { entity, files: new Map() } })

      const result = Validations.CONTENT_V4(args)

      await assertErrorsWere(result, notAvailableHashMessage('hash'))
    })

    it(`When a hash that was not uploaded was already stored, then no error is returned`, async () => {
      const entity = buildEntity({
        content: new Map([['name', 'hash']])
      })
      const args = buildArgs({
        deployment: { entity, files: new Map() },
        externalCalls: { isContentStoredAlready: () => Promise.resolve(new Map([['hash', true]])) }
      })

      const result = Validations.CONTENT_V4(args)

      await assertNoErrors(result)
    })

    it(`When a hash that was uploaded wasn't already stored, then no error is returned`, async () => {
      const entity = buildEntity({
        content: new Map([['name', 'hash']])
      })
      const args = buildArgs({
        deployment: { entity, files: new Map([['hash', Buffer.from([])]]) }
      })

      const result = Validations.CONTENT_V4(args)

      await assertNoErrors(result)
    })

    it(`When a hash is uploaded but not referenced, it is reported`, async () => {
      const entity = buildEntity({ content: new Map([['name-1', 'hash-1']]) })
      const args = buildArgs({
        deployment: {
          entity,
          files: new Map([
            ['hash-1', Buffer.from([])],
            ['hash-2', Buffer.from([])]
          ])
        }
      })

      const result = Validations.CONTENT_V4(args)

      await assertErrorsWere(result, notReferencedHashMessage('hash-2'))
    })

    it(`When profile content files correspond to any shapshot, then no error is returned`, async () => {
      const expectedFile = 'face.png'
      const entity = {
        ...buildEntityV4(EntityType.PROFILE, VALID_PROFILE_METADATA),
        content: new Map([[expectedFile, 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5q']])
      }

      const args = buildArgs({
        deployment: {
          entity,
          files: new Map([['bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5q', Buffer.from([])]])
        }
      })

      const result = Validations.CONTENT_V4(args)

      await assertNoErrors(result)
    })

    it(`When a profile content file hash doesn't correspond to any shapshot, it is reported`, async () => {
      const expectedFile = 'face.png'
      const entity = {
        ...buildEntityV4(EntityType.PROFILE, VALID_PROFILE_METADATA),
        content: new Map([[expectedFile, 'someInvalidHash']])
      }

      const args = buildArgs({
        deployment: {
          entity,
          files: new Map([['someInvalidHash', Buffer.from([])]])
        }
      })

      const result = Validations.CONTENT_V4(args)

      await assertErrorsWere(
        result,
        `This file is not expected: '${expectedFile}' or its hash is invalid: 'someInvalidHash'. Please, include only valid snapshot files.`
      )
    })

    it(`When profile content files don't correspond to any shapshot, it is reported`, async () => {
      const unexpectedFile = 'unexpected-file.png'
      const entity = {
        ...buildEntityV4(EntityType.PROFILE, VALID_PROFILE_METADATA),
        content: new Map([[unexpectedFile, 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5q']])
      }

      const args = buildArgs({
        deployment: {
          entity,
          files: new Map([['bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5q', Buffer.from([])]])
        }
      })

      const result = Validations.CONTENT_V4(args)

      await assertErrorsWere(
        result,
        `This file is not expected: '${unexpectedFile}' or its hash is invalid: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5q'. Please, include only valid snapshot files.`
      )
    })

    const notAvailableHashMessage = (hash) => {
      return `This hash is referenced in the entity but was not uploaded or previously available: ${hash}`
    }

    const notReferencedHashMessage = (hash) => {
      return `This hash was uploaded but is not referenced in the entity: ${hash}`
    }
  })

  describe('Signature', () => {
    it(`When signature is invalid, it's reported`, async () => {
      const entity = buildEntity()
      const args = buildArgs({
        deployment: {
          entity,
          auditInfo: {
            authChain: ContentAuthenticator.createSimpleAuthChain(
              entity.id,
              '0x29d7d1dd5b6f9c864d9db560d72a247c178ae86b',
              'some-signature'
            )
          }
        }
      })

      const result = Validations.SIGNATURE(args)

      await assertSignatureInInvalid(result)
    })

    it(`when signature is valid, it's recognized`, async () => {
      const entity = buildEntity()
      const identity = EthCrypto.createIdentity()
      const authChain = ContentAuthenticator.createSimpleAuthChain(
        entity.id,
        identity.address,
        EthCrypto.sign(identity.privateKey, ContentAuthenticator.createEthereumMessageHash(entity.id))
      )
      const args = buildArgs({
        deployment: {
          entity,
          auditInfo: { authChain }
        }
      })

      const result = Validations.SIGNATURE(args)

      await assertNoErrors(result)
    })

    it(`when a valid chained signature is used, it's recognized`, async () => {
      const entity = buildEntity()
      const ownerIdentity = EthCrypto.createIdentity()
      const ephemeralIdentity = EthCrypto.createIdentity()
      const authChain = ContentAuthenticator.createAuthChain(ownerIdentity, ephemeralIdentity, 30, entity.id)
      const args = buildArgs({
        deployment: {
          entity,
          auditInfo: { authChain }
        }
      })

      const result = Validations.SIGNATURE(args)

      await assertNoErrors(result)
    })

    it(`when no signature is provided, it's reported`, async () => {
      const entity = buildEntity()
      const args = buildArgs({
        deployment: {
          entity,
          auditInfo: { authChain: [] }
        }
      })

      const result = Validations.SIGNATURE(args)

      await assertSignatureInInvalid(result)
    })
  })

  describe('Request size (v3)', () => {
    it(`when an entity is too big per pointer, then it fails`, async () => {
      const entity = buildEntity()
      const args = buildArgs({
        deployment: { entity, files: getFileWithSize(3) },
        env: { maxUploadSizePerTypeInMB: new Map([[EntityType.SCENE, 2]]) }
      })

      const result = Validations.REQUEST_SIZE_V3(args)

      const actualErrors = await result
      expect(actualErrors).toBeDefined()
      expect(actualErrors?.length).toBe(1)
      expect(actualErrors?.[0]).toMatch('The deployment is too big. The maximum allowed size per pointer is *')
    })

    it(`when an entity is big, but has enough pointers, then it is ok`, async () => {
      const entity = buildEntity({ pointers: ['P1', 'P2'] })
      const args = buildArgs({
        deployment: { entity, files: getFileWithSize(3) },
        env: { maxUploadSizePerTypeInMB: new Map([[EntityType.SCENE, 2]]) }
      })

      const result = Validations.REQUEST_SIZE_V3(args)

      await assertNoErrors(result)
    })
  })

  describe('Request size (v4)', () => {
    it(`when an entity is too big per pointer, then it fails`, async () => {
      const content = new Map([['C', 'C']])

      const entity = buildEntity({ content })
      const args = buildArgs({
        deployment: { entity, files: getFileWithSize(3, 'C') },
        env: { maxUploadSizePerTypeInMB: new Map([[EntityType.SCENE, 2]]) }
      })

      const result = Validations.REQUEST_SIZE_V4(args)

      const actualErrors = await result
      expect(actualErrors).toBeDefined()
      expect(actualErrors?.length).toBe(1)
      expect(actualErrors?.[0]).toMatch('The deployment is too big. The maximum allowed size per pointer is *')
    })

    it(`when an entity final version is too big, then it fails`, async () => {
      const content = new Map([
        ['A', 'A'],
        ['B', 'B'],
        ['C', 'C']
      ])

      const contentSizes = new Map([
        ['A', 1024 * 1024 * 5],
        ['B', 1024 * 1024 * 5]
      ])
      const entity = buildEntity({ content })
      const args = buildArgs({
        deployment: { entity, files: getFileWithSize(3, 'C') },
        env: { maxUploadSizePerTypeInMB: new Map([[EntityType.SCENE, 10]]) },
        externalCalls: {
          fetchContentFileSize: (hash) => Promise.resolve(contentSizes.get(hash))
        }
      })

      const result = Validations.REQUEST_SIZE_V4(args)

      const actualErrors = await result
      expect(actualErrors).toBeDefined()
      expect(actualErrors?.length).toBe(1)
      expect(actualErrors?.[0]).toMatch('The deployment is too big. The maximum allowed size per pointer is *')
    })

    it(`when cannot fetch content file in order to check size, then it fails`, async () => {
      const content = new Map([
        ['A', 'A'],
        ['C', 'C']
      ])

      const entity = buildEntity({ content })
      const args = buildArgs({
        deployment: { entity, files: getFileWithSize(3, 'C') },
        env: { maxUploadSizePerTypeInMB: new Map([[EntityType.SCENE, 10]]) },
        externalCalls: {
          fetchContentFileSize: () => Promise.resolve(undefined)
        }
      })

      const result = Validations.REQUEST_SIZE_V4(args)

      const actualErrors = await result
      expect(actualErrors).toBeDefined()
      expect(actualErrors?.length).toBe(1)
      expect(actualErrors?.[0]).toMatch(`Couldn't fetch content file with hash: A`)
    })

    it(`when an entity is big, but has enough pointers, then it is ok`, async () => {
      const entity = buildEntity({ pointers: ['P1', 'P2'], content: new Map([]) })
      const args = buildArgs({
        deployment: { entity, files: getFileWithSize(3) },
        env: { maxUploadSizePerTypeInMB: new Map([[EntityType.SCENE, 2]]) }
      })

      const result = Validations.REQUEST_SIZE_V4(args)

      await assertNoErrors(result)
    })
  })

  describe('IPFS hashing', () => {
    it(`when an entity's id is not an ipfs hash, then it fails`, async () => {
      const entity = buildEntity({ id: 'QmTBPcZLFQf1rZpZg2T8nMDwWRoqeftRdvkaexgAECaqHp' })
      const args = buildArgs({ deployment: { entity } })

      const result = Validations.IPFS_HASHING(args)

      await assertErrorsWere(
        result,
        `This hash 'QmTBPcZLFQf1rZpZg2T8nMDwWRoqeftRdvkaexgAECaqHp' is not valid. It should be IPFS v2 format.`
      )
    })

    it(`when an entity's content file is not an ipfs hash, then it fails`, async () => {
      const entity = buildEntity({ content: new Map([['key', 'QmaG2d2bsb4fW8En9ZUVVhjvAghSpPbfD1XSeoHrYPpn3P']]) })
      const args = buildArgs({ deployment: { entity } })

      const result = Validations.IPFS_HASHING(args)

      await assertErrorsWere(
        result,
        `This hash 'QmaG2d2bsb4fW8En9ZUVVhjvAghSpPbfD1XSeoHrYPpn3P' is not valid. It should be IPFS v2 format.`
      )
    })

    it(`when all entity's hashes are ipfs, then no errors are reported`, async () => {
      const someHash = await Hashing.calculateIPFSHash(Buffer.from('some file'))
      const entity = buildEntity({ content: new Map([['key', someHash]]) })
      const args = buildArgs({ deployment: { entity } })

      const result = Validations.IPFS_HASHING(args)

      await assertNoErrors(result)
    })
  })

  describe('Metadata schema', () => {
    const testType = (type: EntityType, validMetadata: any, invalidMetadata: any) => {
      it('when entity metadata is valid should not report errors', async () => {
        const entity = buildEntityV4(type, validMetadata)
        const args = buildArgs({ deployment: { entity } })
        const result = Validations.METADATA_SCHEMA(args)

        await assertNoErrors(result)
      })
      it('when entity metadata is invalid should report an error', async () => {
        const entity = buildEntityV4(type, invalidMetadata)
        const args = buildArgs({ deployment: { entity } })
        const result = Validations.METADATA_SCHEMA(args)

        await assertErrorsWere(result, `The metadata for this entity type (${type}) is not valid.`)
      })
    }
    describe('PROFILE: ', () => {
      const invalidMetadata = {}
      testType(EntityType.PROFILE, VALID_PROFILE_METADATA, invalidMetadata)
    })

    describe('SCENE: ', () => {
      const validMetadata = {
        main: 'bin/main.js',
        scene: {
          base: '0,0',
          parcels: ['0,0']
        }
      }
      const invalidMetadata = {}
      testType(EntityType.SCENE, validMetadata, invalidMetadata)
    })

    describe('WEARABLE: ', () => {
      const validMetadata = wearable
      const invalidMetadata = {}
      testType(EntityType.WEARABLE, validMetadata, invalidMetadata)
    })
  })

  describe('Rate limit for deployments', () => {
    it(`when it should not be rate limit, then the entity is deployed`, async () => {
      const args = buildArgs({
        deployment: { entity: buildEntity() },
        externalCalls: { isEntityRateLimited: async () => false }
      })

      const result = Validations.RATE_LIMIT(args)

      await assertNoErrors(result)
    })

    it(`when it should be rate limit, then the entity is not deployed`, async () => {
      const entity = buildEntity()

      const args = buildArgs({
        deployment: { entity: entity },
        externalCalls: { isEntityRateLimited: async () => true }
      })

      const result = Validations.RATE_LIMIT(args)

      await assertErrorsWere(result, `The entity with id (${entity.id}) has been rate limited.`)
    })
  })

  describe('Wearable custom validation: ', () => {
    let validThumbnailBuffer: Buffer
    let invalidThumbnailBuffer: Buffer
    const fileName = 'thumbnail.png'
    const hash = 'thumbnail'

    const createImage = async (size: number, format: 'png' | 'jpg' = 'png'): Promise<Buffer> => {
      let image = sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0.5 }
        }
      })
      if (format) {
        image = format === 'png' ? image.png() : image.jpeg()
      }
      return await image.toBuffer()
    }

    beforeAll(async () => {
      validThumbnailBuffer = await createImage(DEFAULT_THUMBNAIL_SIZE)
      invalidThumbnailBuffer = await createImage(1)
    })

    describe('Thumbnail:', () => {
      it('when there is no hash for given thumbnail file name, it should return an error', async () => {
        const content = new Map<string, string>([])
        const files = new Map([[hash, validThumbnailBuffer]])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, wearable), content }
        const args = buildArgs({ deployment: { entity, files } })

        const result = Validations.WEARABLE_THUMBNAIL(args)
        await assertErrorsWere(result, `Couldn't find hash for thumbnail file with name: ${fileName}`)
      })

      it('when there is no file for given thumbnail file hash, it should return an error', async () => {
        const content = new Map<string, string>([[fileName, hash]])
        const files = new Map([['notSame' + hash, validThumbnailBuffer]])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, wearable), content }
        const args = buildArgs({ deployment: { entity, files } })

        const result = Validations.WEARABLE_THUMBNAIL(args)
        await assertErrorsWere(result, `Couldn't find thumbnail file with hash: ${hash}`)
      })

      it('when thumbnail image format is not valid, it should return an error', async () => {
        const content = new Map<string, string>([[fileName, hash]])
        const files = new Map([[hash, Buffer.alloc(1)]])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, wearable), content }
        const args = buildArgs({ deployment: { entity, files } })

        const result = Validations.WEARABLE_THUMBNAIL(args)
        await assertErrorsWere(result, `Couldn't parse thumbnail, please check image format.`)
      })

      it('when thumbnail image size is invalid, it should return an error', async () => {
        const content = new Map<string, string>([[fileName, hash]])
        const files = new Map([[hash, invalidThumbnailBuffer]])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, wearable), content }
        const args = buildArgs({ deployment: { entity, files } })

        const result = Validations.WEARABLE_THUMBNAIL(args)
        await assertErrorsWere(result, `Invalid thumbnail image size (width = 1 / height = 1)`)
      })

      it('when thumbnail image format is not png, it should return an error', async () => {
        const jpgImage = await createImage(DEFAULT_THUMBNAIL_SIZE, 'jpg')
        const content = new Map<string, string>([[fileName, hash]])
        const files = new Map([[hash, jpgImage]])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, wearable), content }
        const args = buildArgs({ deployment: { entity, files } })

        const result = Validations.WEARABLE_THUMBNAIL(args)

        await assertErrorsWere(result, `Invalid or unknown image format. Only 'PNG' format is accepted.`)
      })

      it('when thumbnail image size is valid, should not return any error', async () => {
        const content = new Map<string, string>([[fileName, hash]])
        const files = new Map([[hash, validThumbnailBuffer]])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, wearable), content }
        const args = buildArgs({ deployment: { entity, files } })

        const result = Validations.WEARABLE_THUMBNAIL(args)

        await assertNoErrors(result)
      })
    })

    describe('Size:', () => {
      it(`when a wearable is deployed and model is too big, then it fails`, async () => {
        const withSize = (size: number) => Buffer.alloc(size * 1024 * 1024)
        const content = new Map([
          ['A', 'A'],
          ['C', 'C'],
          ['thumbnail.png', 'thumbnail']
        ])
        const files = new Map([
          ['A', withSize(1)],
          ['C', withSize(1.5)],
          ['thumbnail', Buffer.alloc(1)]
        ])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, { thumbnail: 'thumbnail.png' }), content }
        const args = buildArgs({
          deployment: { entity, files },
          env: { maxUploadSizePerTypeInMB: new Map([[EntityType.WEARABLE, 3]]) }
        })

        const result = Validations.WEARABLE_SIZE(args)

        const actualErrors = await result
        expect(actualErrors).toBeDefined()
        expect(actualErrors?.length).toBe(1)
        expect(actualErrors?.[0]).toMatch(
          'The deployment is too big. The maximum allowed size for wearable model files *'
        )
      })

      it(`when a wearable is deployed and thumbnail is too big, then it fails`, async () => {
        const withSize = (size: number) => Buffer.alloc(size * 1024 * 1024)
        const content = new Map([
          ['A', 'A'],
          ['C', 'C'],
          ['thumbnail.png', 'thumbnail']
        ])
        const files = new Map([
          ['A', withSize(1)],
          ['C', withSize(1)],
          ['thumbnail', withSize(2)]
        ])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, { thumbnail: 'thumbnail.png' }), content }
        const args = buildArgs({
          deployment: { entity, files },
          env: { maxUploadSizePerTypeInMB: new Map([[EntityType.WEARABLE, 3]]) }
        })

        const result = Validations.REQUEST_SIZE_V4(args)

        const actualErrors = await result
        expect(actualErrors).toBeDefined()
        expect(actualErrors?.length).toBe(1)
        expect(actualErrors?.[0]).toMatch('The deployment is too big. *')
      })

      it(`when a wearable is deployed and sizes are correct, then it is ok`, async () => {
        const withSize = (sizeInMB: number) => Buffer.alloc(sizeInMB * 1024 * 1024)
        const content = new Map([
          ['A', 'A'],
          ['C', 'C'],
          ['thumbnail.png', 'thumbnail']
        ])
        const files = new Map([
          ['A', withSize(1)],
          ['C', withSize(1)],
          ['thumbnail', withSize(0.9)]
        ])
        const entity = { ...buildEntityV4(EntityType.WEARABLE, { thumbnail: 'thumbnail.png' }), content }
        const args = buildArgs({
          deployment: { entity, files },
          env: { maxUploadSizePerTypeInMB: new Map([[EntityType.WEARABLE, 3]]) }
        })

        const result = Validations.WEARABLE_SIZE(args)
        await assertNoErrors(result)
      })
    })
  })
})
