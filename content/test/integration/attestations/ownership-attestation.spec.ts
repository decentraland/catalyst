/**
 * E2E Test for Ownership Attestation Validation
 *
 * This test validates that the Catalyst correctly accepts ownership attestations
 * from trusted signers and skips blockchain validation for wearables covered by
 * valid attestations.
 */

import { Authenticator, AuthChain } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { EntityType, AuthLinkType } from '@dcl/schemas'
import { buildEntity } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import fetch from 'node-fetch'
import FormData from 'form-data'
import LeakDetector from 'jest-leak-detector'
import { DeploymentContext } from '../../../src/deployment-types'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import { OwnershipAttestation } from '../../../src/service/validations/attestations/types'

/**
 * Test keypair - must match the trusted signer in validator.ts
 * Address: 0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5
 */
const TEST_ATTESTATION_SIGNER = {
  address: '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5',
  privateKey: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
}

/**
 * Create a test identity with a known private key for signing attestations
 */
function createSignerIdentity(): { address: string; privateKey: string } {
  return TEST_ATTESTATION_SIGNER
}

/**
 * Create deterministic JSON payload with sorted keys
 */
function createDeterministicPayload(payload: {
  urn: string
  version: number
  beneficiary: string
  itemUrn: string
  issuedAt: number
  expiresAt: number
}): string {
  return JSON.stringify({
    beneficiary: payload.beneficiary,
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt,
    itemUrn: payload.itemUrn,
    urn: payload.urn,
    version: payload.version
  })
}

/**
 * Create a test ownership attestation
 */
function createTestAttestation(beneficiary: string, itemUrn: string): OwnershipAttestation {
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + 24 * 3600 // 24 hours validity

  const payload = {
    urn: `urn:decentraland:attestation:ownership:test-reward-${Date.now()}`,
    version: 1,
    beneficiary: beneficiary.toLowerCase(),
    itemUrn: itemUrn.toLowerCase(),
    issuedAt,
    expiresAt
  }

  const payloadString = createDeterministicPayload(payload)

  // Sign using Authenticator (this matches what @dcl/crypto expects)
  const signerIdentity = createSignerIdentity()
  const signature = Authenticator.createSignature(signerIdentity as any, payloadString)

  const authChain: AuthChain = [
    {
      type: AuthLinkType.SIGNER,
      payload: signerIdentity.address.toLowerCase(),
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
      payload: payloadString,
      signature: signature
    }
  ]

  return {
    ...payload,
    authChain
  }
}

/**
 * Create a test ownership attestation with custom times (for testing expiry)
 */
function createTestAttestationWithTimes(
  beneficiary: string,
  itemUrn: string,
  issuedAt: number,
  expiresAt: number
): OwnershipAttestation {
  const payload = {
    urn: `urn:decentraland:attestation:ownership:test-reward-${Date.now()}`,
    version: 1,
    beneficiary: beneficiary.toLowerCase(),
    itemUrn: itemUrn.toLowerCase(),
    issuedAt,
    expiresAt
  }

  const payloadString = createDeterministicPayload(payload)
  const signerIdentity = createSignerIdentity()
  const signature = Authenticator.createSignature(signerIdentity as any, payloadString)

  const authChain: AuthChain = [
    {
      type: AuthLinkType.SIGNER,
      payload: signerIdentity.address.toLowerCase(),
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
      payload: payloadString,
      signature: signature
    }
  ]

  return {
    ...payload,
    authChain
  }
}

/**
 * Build a profile entity with wearables
 */
async function buildProfileEntity(
  identity: { address: string; privateKey: string },
  wearables: string[]
): Promise<{ entityId: string; files: Map<string, Uint8Array>; authChain: AuthChain }> {
  const pointers = [identity.address.toLowerCase()]

  const profileMetadata = {
    avatars: [
      {
        userId: identity.address.toLowerCase(),
        email: '',
        name: 'Test User',
        hasClaimedName: false,
        description: 'Test profile for attestation PoC',
        ethAddress: identity.address.toLowerCase(),
        version: 1,
        avatar: {
          bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseFemale',
          eyes: { color: { r: 0.125, g: 0.703, b: 0.964 } },
          hair: { color: { r: 0.234, g: 0.128, b: 0.055 } },
          skin: { color: { r: 0.8, g: 0.6, b: 0.5 } },
          wearables: wearables,
          snapshots: {
            face256: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5q',
            body: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
          }
        }
      }
    ]
  }

  const deploymentData = await buildEntity({
    type: EntityType.PROFILE,
    pointers,
    timestamp: Date.now(),
    metadata: profileMetadata
  })

  const signature = Authenticator.createSignature(identity as any, deploymentData.entityId)
  const authChain = Authenticator.createSimpleAuthChain(deploymentData.entityId, identity.address, signature)

  return {
    entityId: deploymentData.entityId,
    files: deploymentData.files,
    authChain
  }
}

describe('Integration - Ownership Attestations', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    // We don't use NoopValidator here because we want to test the actual attestation validation
  })

  afterEach(async () => {
    await resetServer(server)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('should accept deployment with valid ownership attestation', async () => {
    // Create a test identity (user wallet)
    const identity = createUnsafeIdentity()

    // Test wearable URN that would normally require blockchain validation
    const wearableUrn = 'urn:decentraland:matic:collections-v2:0x1234567890123456789012345678901234567890:1'

    // Create an attestation for this wearable
    const attestation = createTestAttestation(identity.address, wearableUrn)

    // Build a profile entity that includes this wearable
    const { entityId, files, authChain } = await buildProfileEntity(identity, [wearableUrn])

    // Deploy the entity with the attestation
    const deploymentResult = await server.components.deployer.deployEntity(
      Array.from(files.values()),
      entityId,
      {
        authChain,
        attestationAuthChains: [attestation.authChain]
      },
      DeploymentContext.LOCAL
    )

    // The deployment should succeed (return a timestamp, not an error)
    expect(typeof deploymentResult).toBe('number')
  })

  it('should accept deployment via HTTP endpoint with attestation in form data', async () => {
    // Create a test identity (user wallet)
    const identity = createUnsafeIdentity()

    // Test wearable URN
    const wearableUrn = 'urn:decentraland:matic:collections-v2:0x1234567890123456789012345678901234567890:2'

    // Create an attestation
    const attestation = createTestAttestation(identity.address, wearableUrn)

    // Build a profile entity
    const { entityId, files, authChain } = await buildProfileEntity(identity, [wearableUrn])

    // Create form data for HTTP request
    const form = new FormData()
    form.append('entityId', entityId)
    form.append('authChain', JSON.stringify(authChain))
    form.append('ownershipAttestations', JSON.stringify([attestation]))

    // Add the entity file
    const entityFile = files.get(entityId)
    if (entityFile) {
      form.append(entityId, Buffer.from(entityFile), { filename: entityId })
    }

    // Make HTTP request to deploy
    const url = server.getUrl() + '/entities'
    const res = await fetch(url, {
      method: 'POST',
      body: form as any
    })

    const body = await res.json()

    // Should succeed
    expect(res.status).toBe(200)
    expect(body.creationTimestamp).toBeDefined()
  })

  it('should reject deployment with expired attestation', async () => {
    const identity = createUnsafeIdentity()
    const wearableUrn = 'urn:decentraland:matic:collections-v2:0x1234567890123456789012345678901234567890:3'

    // Create an expired attestation (issued and expired in the past)
    const pastTime = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    const expiredAttestation = createTestAttestationWithTimes(
      identity.address,
      wearableUrn,
      pastTime - 7200, // issued 3 hours ago
      pastTime // expired 1 hour ago
    )

    const { entityId, files, authChain } = await buildProfileEntity(identity, [wearableUrn])

    // This should fall back to blockchain validation (which will fail since the wearable doesn't exist)
    const deploymentResult = await server.components.deployer.deployEntity(
      Array.from(files.values()),
      entityId,
      {
        authChain,
        attestationAuthChains: [expiredAttestation.authChain]
      },
      DeploymentContext.LOCAL
    )

    // The deployment should fail (attestation expired, blockchain validation would be needed)
    // Since the wearable doesn't exist on blockchain, it should return errors
    expect(typeof deploymentResult).not.toBe('number')
    expect(deploymentResult).toHaveProperty('errors')
  })

  it('should reject deployment with untrusted signer', async () => {
    const identity = createUnsafeIdentity()
    const wearableUrn = 'urn:decentraland:matic:collections-v2:0x1234567890123456789012345678901234567890:4'

    // Create an attestation with a valid signature but wrong signer address
    const attestation = createTestAttestation(identity.address, wearableUrn)
    // Modify the signer to an untrusted address (signature will be invalid but signer check comes first)
    attestation.authChain[0].payload = '0x0000000000000000000000000000000000000001'

    const { entityId, files, authChain } = await buildProfileEntity(identity, [wearableUrn])

    // This should fall back to blockchain validation
    const deploymentResult = await server.components.deployer.deployEntity(
      Array.from(files.values()),
      entityId,
      {
        authChain,
        attestationAuthChains: [attestation.authChain]
      },
      DeploymentContext.LOCAL
    )

    // The deployment should fail
    expect(typeof deploymentResult).not.toBe('number')
    expect(deploymentResult).toHaveProperty('errors')
  })

  it('should reject deployment with beneficiary mismatch', async () => {
    const identity = createUnsafeIdentity()
    const differentIdentity = createUnsafeIdentity()
    const wearableUrn = 'urn:decentraland:matic:collections-v2:0x1234567890123456789012345678901234567890:5'

    // Create an attestation for a different user
    const attestation = createTestAttestation(differentIdentity.address, wearableUrn)

    // Build profile for the original identity
    const { entityId, files, authChain } = await buildProfileEntity(identity, [wearableUrn])

    // This should fail because the attestation beneficiary doesn't match the deployer
    const deploymentResult = await server.components.deployer.deployEntity(
      Array.from(files.values()),
      entityId,
      {
        authChain,
        attestationAuthChains: [attestation.authChain]
      },
      DeploymentContext.LOCAL
    )

    // The deployment should fail
    expect(typeof deploymentResult).not.toBe('number')
    expect(deploymentResult).toHaveProperty('errors')
  })
})
