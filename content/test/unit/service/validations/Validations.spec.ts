import { AccessCheckerImpl } from '@katalyst/content/service/access/AccessCheckerImpl'
import { ContentAuthenticator } from '@katalyst/content/service/auth/Authenticator'
import { Deployment } from '@katalyst/content/service/deployments/DeploymentManager'
import { ValidationContext } from '@katalyst/content/service/validations/ValidationContext'
import { Validations } from '@katalyst/content/service/validations/Validations'
import { MockedAccessChecker } from '@katalyst/test-helpers/service/access/MockedAccessChecker'
import { AuditInfo, Entity, EntityType, EntityVersion, Fetcher, Timestamp } from 'dcl-catalyst-commons'
import { AuthChain, AuthLinkType } from 'dcl-crypto'
import * as EthCrypto from 'eth-crypto'
import ms from 'ms'

describe('Validations', function () {
  it(`When a non uploaded hash is referenced, it is reported`, () => {
    const entity = buildEntity({
      content: new Map([
        ['name-1', 'hash-1'],
        ['name-2', 'hash-2']
      ])
    })
    const validation = getValidatorWithMockedAccess()
    validation.validateContent(
      entity,
      new Map([['hash-1', { name: 'name-1', content: Buffer.from([]) }]]),
      new Map([]),
      ValidationContext.ALL
    )

    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toBe(notAvailableHashMessage('hash-2'))
  })

  it(`When an entity with a timestamp too far into the past is deployed, then an error is returned`, () => {
    const entity = buildEntity({ timestamp: Date.now() - ms('25m') })
    const validation = getValidatorWithMockedAccess()
    validation.validateDeploymentIsRecent(entity, ValidationContext.ALL)

    expect(validation.getErrors()).toEqual([
      'The request is not recent enough, please submit it again with a new timestamp.'
    ])
  })

  it(`When an entity with a timestamp too far into the future is deployed, then an error is returned`, () => {
    const entity = buildEntity({ timestamp: Date.now() + ms('20m') })
    const validation = getValidatorWithMockedAccess()
    validation.validateDeploymentIsRecent(entity, ValidationContext.ALL)

    expect(validation.getErrors()).toEqual([
      'The request is too far in the future, please submit it again with a new timestamp.'
    ])
  })

  it(`When an entity with the correct timestamp is deployed, then no error is returned`, () => {
    const entity = buildEntity({ timestamp: Date.now() })
    const validation = getValidatorWithMockedAccess()
    validation.validateDeploymentIsRecent(entity, ValidationContext.ALL)
    expect(validation.getErrors().length).toBe(0)
  })

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
    const validation = getValidatorWithMockedAccess()
    const history = { deployments: [] }
    await validation.validateLegacyEntity(
      LEGACY_ENTITY,
      LEGACY_AUDIT_INFO,
      () => Promise.resolve(history),
      ValidationContext.ALL
    )
    expect(validation.getErrors().length).toBe(0)
  })

  it(`When a legacy entity is deployed and there is an entity with a higher timestamp, then no error is returned`, async () => {
    const entity = buildEntity({ timestamp: 1001 })
    const auditInfo = {
      version: EntityVersion.V3,
      deployedTimestamp: 10,
      authChain: []
    }
    const validation = getValidatorWithMockedAccess()
    await validation.validateLegacyEntity(
      LEGACY_ENTITY,
      LEGACY_AUDIT_INFO,
      () => Promise.resolve(deploymentWith(entity, auditInfo)),
      ValidationContext.ALL
    )
    expect(validation.getErrors().length).toBe(0)
  })

  it(`When a legacy entity is deployed and there is a previous entity with a higher version, then an error is returned`, async () => {
    const entity = buildEntity({ timestamp: 999 })
    const legacyAuditInfo = { ...LEGACY_AUDIT_INFO, version: EntityVersion.V2 }
    const auditInfo = {
      version: EntityVersion.V3,
      deployedTimestamp: 10,
      authChain: []
    }
    const validation = getValidatorWithMockedAccess()
    await validation.validateLegacyEntity(
      LEGACY_ENTITY,
      legacyAuditInfo,
      () => Promise.resolve(deploymentWith(entity, auditInfo)),
      ValidationContext.ALL
    )
    expect(validation.getErrors()).toEqual([`Found an overlapping entity with a higher version already deployed.`])
  })

  it(`When a legacy entity is deployed and there is a previous entity with a lower version, then no error is returned`, async () => {
    const entity = buildEntity({ timestamp: 999 })
    const auditInfo = {
      version: EntityVersion.V2,
      deployedTimestamp: 10,
      authChain: []
    }
    const validation = getValidatorWithMockedAccess()
    await validation.validateLegacyEntity(
      LEGACY_ENTITY,
      LEGACY_AUDIT_INFO,
      () => Promise.resolve(deploymentWith(entity, auditInfo)),
      ValidationContext.ALL
    )
    expect(validation.getErrors().length).toBe(0)
  })

  it(`When a legacy entity is deployed and there is a previous entity without original metadata, then an error is returned`, async () => {
    const entity = buildEntity({ timestamp: 999 })
    const auditInfo = {
      version: EntityVersion.V3,
      authChain: []
    }
    const validation = getValidatorWithMockedAccess()
    await validation.validateLegacyEntity(
      LEGACY_ENTITY,
      LEGACY_AUDIT_INFO,
      () => Promise.resolve(deploymentWith(entity, auditInfo)),
      ValidationContext.ALL
    )
    expect(validation.getErrors()).toEqual([`Found an overlapping entity with a higher version already deployed.`])
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
    const validation = getValidatorWithMockedAccess()
    await validation.validateLegacyEntity(
      LEGACY_ENTITY,
      LEGACY_AUDIT_INFO,
      () => Promise.resolve(deploymentWith(entity, auditInfo)),
      ValidationContext.ALL
    )
    expect(validation.getErrors()).toEqual([`Found an overlapping entity with a higher version already deployed.`])
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
    const validation = getValidatorWithMockedAccess()
    await validation.validateLegacyEntity(
      LEGACY_ENTITY,
      LEGACY_AUDIT_INFO,
      () => Promise.resolve(deploymentWith(entity, auditInfo)),
      ValidationContext.ALL
    )
    expect(validation.getErrors().length).toBe(0)
  })

  it(`When a non available hash is referenced, it is reported`, () => {
    const entity = buildEntity({
      content: new Map([
        ['name-1', 'hash-1'],
        ['name-2', 'hash-2']
      ])
    })
    const validation = getValidatorWithMockedAccess()
    validation.validateContent(entity, new Map([]), new Map([['hash-2', true]]), ValidationContext.ALL)

    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toBe(notAvailableHashMessage('hash-1'))
  })

  it(`When a hash is uploaded but not referenced, it is reported`, () => {
    const entity = buildEntity({ content: new Map([['name-1', 'hash-1']]) })
    const validation = getValidatorWithMockedAccess()
    validation.validateContent(
      entity,
      new Map([
        ['hash-1', { name: 'name-1', content: Buffer.from([]) }],
        ['hash-2', { name: 'name-2', content: Buffer.from([]) }]
      ]),
      new Map([]),
      ValidationContext.ALL
    )

    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toBe(notReferencedHashMessage('hash-2'))
  })

  it(`Already available but not referenced hashes are not reported`, () => {
    const entity = buildEntity()
    const validation = getValidatorWithMockedAccess()
    validation.validateContent(
      entity,
      new Map([['hash-1', { name: 'name-1', content: Buffer.from([]) }]]),
      new Map([['hash-2', true]]),
      ValidationContext.ALL
    )

    expect(validation.getErrors().length).toBe(0)
  })

  it(`signature test`, async () => {
    const identity = EthCrypto.createIdentity()

    const message = 'foobar'
    const messageHash = EthCrypto.hash.keccak256(message)
    const signature = EthCrypto.sign(identity.privateKey, messageHash)

    const signer = EthCrypto.recover(signature, messageHash)

    expect(signer).toBe(identity.address)
  })

  it(`signature test on ipfs hash`, async () => {
    const message = 'QmUX9jcGbUATv4MAZaMGT9qiDJb59KBhN8TkyeGsWwzHon'
    const signature =
      '0x7f34bc8e3bce648c7e31705172f10b171777eda2d6b87cc53d581faa0ed0f518281691afc6ac51fd7848ba5464642878ae7728e13819dd359f1c9a15e15013fb1b'
    const expectedSigner = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
    validateExpectedAddress(message, signature, expectedSigner)
  })

  it(`signature test on human readable message`, async () => {
    const message =
      'Decentraland Login\nEphemeral address: 0x1F19d3EC0BE294f913967364c1D5B416e6A74555\nExpiration: Tue Jan 21 2020 16:34:32 GMT+0000 (Coordinated Universal Time)'
    const signature =
      '0x49c5d57fc804e6a06f83ee8d499aec293a84328766864d96349db599ef9ebacc072892ec1f3e2777bdc8265b53d8b84edd646bdc711dd5290c18adcc5de4a2831b'
    const expectedSigner = '0x1f19d3ec0be294f913967364c1d5b416e6a74555'
    validateExpectedAddress(message, signature, expectedSigner)
  })

  it(`signature test on human readable message 2`, async () => {
    const identity = EthCrypto.createIdentity()
    const expiration = new Date()
    expiration.setMinutes(expiration.getMinutes() + 30)

    const message = `Decentraland Login\nEphemeral address: ${identity.address}\nExpiration: ${expiration}`
    const signature = ContentAuthenticator.createSignature(identity, message)
    const expectedSigner = identity.address.toLowerCase()
    validateExpectedAddress(message, signature, expectedSigner)
  })

  it(`signature test on human readable message 3`, async () => {
    const message = 'Decentraland Login\nEphemeral address: ${ephemeralIdentity.address}\nExpiration: ${expiration}'
    const signature =
      '0x93e6c60fbe79e5a6b94c2f560730eaf1b8eeac4859046ac90d3cff14f9be65aa6d7fad907ce320979d56848d7d7c13cb10295d739eb2a3d99f0e6e9cba56ff7c1b'
    const expectedSigner = '0xe4d3ba99ffdae47c003f1756c01d8e7ee8fef7c9'
    validateExpectedAddress(message, signature, expectedSigner)
  })

  it(`signature test on human readable message 4`, async () => {
    const identity = EthCrypto.createIdentity()
    const message = 'Decentraland Login\nEphemeral'
    const signature = ContentAuthenticator.createSignature(identity, message)
    const expectedSigner = identity.address.toLowerCase()
    validateExpectedAddress(message, signature, expectedSigner)
  })

  it(`signature test on human readable message 4b`, async () => {
    const message = 'Decentraland Login\nEphemeral'
    const signature =
      '0x4163812d18beaa732edc4c9d106c4824b7efa565b96841e0a3d9c1863112cab627fb1d7ff7c1b3330d7c5021b76852080d349f7dfd26d59afdac21fc378d51a21b'
    const expectedSigner = '0xd5af26a5adfc888843d765da9a5cda6f1416eb9d'
    validateExpectedAddress(message, signature, expectedSigner)
  })

  it(`signature test on human readable message 5`, async () => {
    const identity = EthCrypto.createIdentity()
    const message = 'Decentraland Login Ephemeral'
    const signature = ContentAuthenticator.createSignature(identity, message)
    const expectedSigner = identity.address.toLowerCase()
    validateExpectedAddress(message, signature, expectedSigner)
  })

  it(`signature test on human readable message 5b`, async () => {
    const message = 'Decentraland Login Ephemeral'
    const signature =
      '0x29561864c8c058688dc5043e04a1dc234d7cbd9201d26029402c0ca4d86d3a337e200f4136dbf40ada341674c79ece56946720b20bc645dd3cc029ab824680891b'
    const expectedSigner = '0xf37cb6620d0efcfdaf4a166e3ddd75daa4975b39'
    validateExpectedAddress(message, signature, expectedSigner)
  })

  function validateExpectedAddress(message: string, signature: string, expectedSigner: string) {
    const messageHash = ContentAuthenticator.createEthereumMessageHash(message)

    const signer = EthCrypto.recover(signature, messageHash).toLowerCase()

    expect(signer).toBe(expectedSigner)
  }

  it(`when signature is invalid, it's reported`, async () => {
    const validation = getValidatorWithMockedAccess()
    await validation.validateSignature(
      'some-entity-id',
      Date.now(),
      ContentAuthenticator.createSimpleAuthChain('some-entity-id', 'some-address', 'some-signature'),
      ValidationContext.ALL
    )

    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toMatch('The signature is invalid.*')
  })

  it(`when signature is valid, it's recognized`, async () => {
    const identity = EthCrypto.createIdentity()
    const entityId = 'some-entity-id'
    const validation = getValidatorWithMockedAccess()
    await validation.validateSignature(
      entityId,
      Date.now(),
      ContentAuthenticator.createSimpleAuthChain(
        entityId,
        identity.address,
        EthCrypto.sign(identity.privateKey, ContentAuthenticator.createEthereumMessageHash(entityId))
      ),
      ValidationContext.ALL
    )

    expect(validation.getErrors().length).toBe(0)
  })

  it(`when a valid chained signature is used, it's recognized`, async () => {
    const entityId = 'some-entity-id'

    const ownerIdentity = EthCrypto.createIdentity()
    const ephemeralIdentity = EthCrypto.createIdentity()

    const authChain = ContentAuthenticator.createAuthChain(ownerIdentity, ephemeralIdentity, 30, entityId)

    const validation = getValidatorWithMockedAccess()
    await validation.validateSignature(entityId, Date.now(), authChain, ValidationContext.ALL)
    expect(validation.getErrors().length).toBe(0)
  })

  it(`when an invalid chained signature is used, it's reported`, async () => {
    const entityId = 'some-entity-id'

    const ownerIdentity = EthCrypto.createIdentity()
    const ephemeralIdentity = EthCrypto.createIdentity()

    const signatures_second_is_invalid = ContentAuthenticator.createAuthChain(
      ownerIdentity,
      ephemeralIdentity,
      30,
      entityId
    )
    signatures_second_is_invalid[2].signature = 'invalid-signature'

    let validation = getValidatorWithMockedAccess()
    await validation.validateSignature(entityId, Date.now(), signatures_second_is_invalid, ValidationContext.ALL)
    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toMatch('The signature is invalid.*')

    const signatures_first_is_invalid = ContentAuthenticator.createAuthChain(
      ownerIdentity,
      ephemeralIdentity,
      30,
      entityId
    )
    signatures_first_is_invalid[1].signature = 'invalid-signature'

    validation = getValidatorWithMockedAccess()
    await validation.validateSignature(entityId, Date.now(), signatures_first_is_invalid, ValidationContext.ALL)
    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toMatch('The signature is invalid.*')
  })

  it(`when no signature are provided, it's reported`, async () => {
    const validation = getValidatorWithMockedAccess()
    const invalidAuthChain: AuthChain = []
    await validation.validateSignature('some-entity-id', Date.now(), invalidAuthChain, ValidationContext.ALL)
    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toMatch('The signature is invalid.*')
  })

  it(`when only signer link is provided, it's reported`, async () => {
    const validation = getValidatorWithMockedAccess()
    const ownerIdentity = EthCrypto.createIdentity()
    const invalidAuthChain: AuthChain = [{ type: AuthLinkType.SIGNER, payload: ownerIdentity.address, signature: '' }]
    await validation.validateSignature('some-entity-id', Date.now(), invalidAuthChain, ValidationContext.ALL)
    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toMatch('The signature is invalid.*')
  })

  it(`when a profile is created its access is checked`, async () => {
    const validation = getValidatorWithRealAccess()
    await validation.validateAccess(
      EntityType.PROFILE,
      ['some-address'],
      Date.now(),
      'some-address',
      ValidationContext.ALL
    )
    expect(validation.getErrors().length).toBe(0)
  })

  it(`when a profile is created and too many pointers are sent, the access check fails`, async () => {
    const validation = getValidatorWithRealAccess()
    await validation.validateAccess(
      EntityType.PROFILE,
      ['some-address', 'other-address'],
      Date.now(),
      'some-address',
      ValidationContext.ALL
    )
    expect(validation.getErrors().length).toBe(1)
  })

  it(`when a profile is created and the pointers does not match the signer, the access check fails`, async () => {
    const validation = getValidatorWithRealAccess()
    await validation.validateAccess(
      EntityType.PROFILE,
      ['other-address'],
      Date.now(),
      'some-address',
      ValidationContext.ALL
    )
    expect(validation.getErrors().length).toBe(1)
  })

  it(`when an entity is too big per pointer, then it fails`, async () => {
    const validation = getValidatorWithMockedAccess({ maxSizePerPointer: { type: EntityType.SCENE, size: 2 } })

    validation.validateRequestSize([getFileWithSize(3)], EntityType.SCENE, ['pointer1'], ValidationContext.ALL)

    expect(validation.getErrors().length).toBe(1)
    expect(validation.getErrors()[0]).toMatch('The deployment is too big. The maximum allowed size per pointer is *')
  })

  it(`when an entity is big, but has enough pointers, then it is ok`, async () => {
    const validation = getValidatorWithMockedAccess({ maxSizePerPointer: { type: EntityType.SCENE, size: 2 } })

    validation.validateRequestSize(
      [getFileWithSize(3)],
      EntityType.SCENE,
      ['pointer1', 'pointer2'],
      ValidationContext.ALL
    )

    expect(validation.getErrors().length).toBe(0)
  })
})

const notAvailableHashMessage = (hash) => {
  return `This hash is referenced in the entity but was not uploaded or previously available: ${hash}`
}

const notReferencedHashMessage = (hash) => {
  return `This hash was uploaded but is not referenced in the entity: ${hash}`
}

function buildEntity(options?: { timestamp?: Timestamp; content?: Map<string, string> }) {
  const opts = Object.assign({ timestamp: Date.now(), content: undefined }, options)
  return { id: 'id', type: EntityType.SCENE, pointers: ['P1'], timestamp: opts.timestamp, content: opts.content }
}

function getValidatorWithRealAccess() {
  const authenticator = new ContentAuthenticator()
  return new Validations(
    new AccessCheckerImpl({
      authenticator,
      fetcher: new Fetcher(),
      landManagerSubgraphUrl: 'unused_url',
      collectionsL1SubgraphUrl: 'unused_url',
      collectionsL2SubgraphUrl: 'unused_url',
      blocksL1SubgraphUrl: 'unused_url',
      blocksL2SubgraphUrl: 'unused_url'
    }),
    authenticator,
    'ropsten',
    ms('10m')
  ).getInstance()
}

function getFileWithSize(sizeInMB: number) {
  return { name: '', content: Buffer.alloc(sizeInMB * 1024 * 1024) }
}

function getValidatorWithMockedAccess(options?: { maxSizePerPointer: { type: EntityType; size: number } }) {
  const maxSizeMap: Map<EntityType, number> = options
    ? new Map([[options.maxSizePerPointer.type, options.maxSizePerPointer.size]])
    : new Map()
  return new Validations(
    new MockedAccessChecker(),
    new ContentAuthenticator(),
    'ropsten',
    ms('10m'),
    maxSizeMap
  ).getInstance()
}

function deploymentWith(entity: Entity, auditInfo: Partial<AuditInfo>) {
  const deployment: Deployment = {
    ...entity,
    entityId: entity.id,
    entityTimestamp: entity.timestamp,
    entityType: entity.type,
    deployedBy: '0x...',
    content: undefined,
    auditInfo: {
      version: EntityVersion.V2,
      authChain: [],
      localTimestamp: 20,
      ...auditInfo
    }
  }
  return { deployments: [deployment] }
}
