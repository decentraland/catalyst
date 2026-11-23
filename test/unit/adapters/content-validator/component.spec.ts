import { DeploymentToValidate, validationFailed } from '@dcl/content-validator'
import { Authenticator, IdentityType } from '@dcl/crypto'
import { computeAddress } from '@dcl/crypto/dist/crypto'
import { hashV1 } from '@dcl/hashing'
import { EntityType } from '@dcl/schemas'
import { createECDH } from 'crypto'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createContentValidator } from '../../../../src/adapters/content-validator/component'
import { IContentValidator } from '../../../../src/adapters/content-validator/types'
import { ICrypto, createCrypto } from '../../../../src/logic/crypto'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { AppComponents } from '../../../../src/types'
import { createHttpProviderMock } from '../../../mocks/http-provider-mock'
import { createLogsMockedComponent } from '../../../mocks/logger-component-mock'
import { createStorageComponentMock } from '../../../mocks/storage-component-mock'

describe('when validating a scene deployment with blockchain access checks disabled', () => {
  let logs: ILoggerComponent
  let crypto: jest.Mocked<ICrypto>
  let env: Environment
  let validator: IContentValidator
  let deployment: DeploymentToValidate

  beforeEach(async () => {
    logs = createLogsMockedComponent()
    crypto = {
      calculateIPFSHashes: jest.fn(),
      calculateDeprecatedHashes: jest.fn(),
      isAddressOwnedByDecentraland: jest.fn().mockReturnValue(false),
      validateSignature: jest.fn().mockResolvedValue({ ok: true })
    }
    env = new Environment()
    env.setConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS, 'true')
    env.setConfig(EnvironmentConfig.CONTENT_SIZE_FETCH_CONCURRENCY, 10)
    validator = await createContentValidator({
      storage: createStorageComponentMock({ existMultiple: jest.fn().mockResolvedValue(new Map()) }),
      crypto,
      env,
      logs,
      metrics: { increment: jest.fn(), observe: jest.fn() } as unknown as AppComponents['metrics'],
      config: createConfigComponent({}),
      fetcher: { fetch: jest.fn() },
      l1Provider: createHttpProviderMock([]),
      l2Provider: createHttpProviderMock([])
    })
    deployment = {
      entity: {
        id: await hashV1(new TextEncoder().encode('scene-identity-smoke-test-entity')),
        version: 'v3',
        type: EntityType.SCENE,
        pointers: ['0,0', '0,1'],
        timestamp: 1735689600000, // 2025-01-01, after every timestamp-gated ADR validation
        content: [],
        metadata: {
          main: 'bin/game.js',
          scene: { base: '0,0', parcels: ['0,0', '0,1'] }
        }
      },
      files: new Map(),
      auditInfo: { authChain: [] }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the scene parcels match the entity pointers', () => {
    it('should accept the deployment', async () => {
      const result = await validator.validate(deployment)

      expect(result.ok).toBe(true)
    })
  })

  describe('and the entity pointers do not cover every scene parcel', () => {
    beforeEach(() => {
      deployment.entity.pointers = ['0,0']
    })

    it('should reject the deployment before reaching the bypassed access validator', async () => {
      const result = await validator.validate(deployment)

      expect(result).toEqual(validationFailed('The scene parcels must match the entity pointers.'))
    })
  })

  describe('and the scene base is not one of the scene parcels', () => {
    beforeEach(() => {
      deployment.entity.metadata.scene.base = '5,5'
    })

    it('should reject the deployment before reaching the bypassed access validator', async () => {
      const result = await validator.validate(deployment)

      expect(result.ok).toBe(false)
    })
  })
})

type ValidatorAuthChain = DeploymentToValidate['auditInfo']['authChain']
type ValidatorAuthLinkType = ValidatorAuthChain[number]['type']

// Deterministic identity: the unit environment has no WebCrypto for random key generation.
function createTestIdentity(privateKeyHex: string): IdentityType {
  const ecdh = createECDH('secp256k1')
  ecdh.setPrivateKey(Buffer.from(privateKeyHex, 'hex'))
  const publicKey = ecdh.getPublicKey().subarray(1)
  return {
    privateKey: `0x${privateKeyHex}`,
    publicKey: `0x${publicKey.toString('hex')}`,
    address: computeAddress(publicKey)
  }
}

describe('when validating the signature of a deployment through the content validator', () => {
  let signer: IdentityType
  let ephemeral: IdentityType
  let ephemeralMessage: string
  let env: Environment
  let validator: IContentValidator
  let deployment: DeploymentToValidate

  function buildAuthChain(ephemeralLinkType: string): ValidatorAuthChain {
    return [
      { type: 'SIGNER' as ValidatorAuthLinkType, payload: signer.address, signature: '' },
      {
        type: ephemeralLinkType as ValidatorAuthLinkType,
        payload: ephemeralMessage,
        signature: Authenticator.createSignature(signer, ephemeralMessage)
      },
      {
        type: 'ECDSA_SIGNED_ENTITY' as ValidatorAuthLinkType,
        payload: deployment.entity.id,
        signature: Authenticator.createSignature(ephemeral, deployment.entity.id)
      }
    ]
  }

  beforeEach(async () => {
    signer = createTestIdentity('11'.repeat(32))
    ephemeral = createTestIdentity('22'.repeat(32))
    ephemeralMessage = Authenticator.getEphemeralMessage(ephemeral.address, new Date(Date.now() + 10 * 60 * 1000))
    env = new Environment()
    env.setConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS, 'true')
    env.setConfig(EnvironmentConfig.CONTENT_SIZE_FETCH_CONCURRENCY, 10)
    validator = await createContentValidator({
      storage: createStorageComponentMock({ existMultiple: jest.fn().mockResolvedValue(new Map()) }),
      crypto: createCrypto(createHttpProviderMock([]), []),
      env,
      logs: createLogsMockedComponent(),
      metrics: { increment: jest.fn(), observe: jest.fn() } as unknown as AppComponents['metrics'],
      config: createConfigComponent({}),
      fetcher: { fetch: jest.fn() },
      l1Provider: createHttpProviderMock([]),
      l2Provider: createHttpProviderMock([])
    })
    deployment = {
      entity: {
        id: await hashV1(new TextEncoder().encode('scoped-ephemeral-signature-test-entity')),
        version: 'v3',
        type: EntityType.SCENE,
        pointers: ['0,0'],
        timestamp: Date.now(),
        content: [],
        metadata: {
          main: 'bin/game.js',
          scene: { base: '0,0', parcels: ['0,0'] }
        }
      },
      files: new Map(),
      auditInfo: { authChain: [] }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the auth chain is signed through a personal ephemeral link', () => {
    beforeEach(() => {
      deployment.auditInfo.authChain = buildAuthChain('ECDSA_EPHEMERAL')
    })

    it('should accept the deployment', async () => {
      const result = await validator.validate(deployment)

      expect(result.ok).toBe(true)
    })
  })

  describe('and the auth chain is signed through a scoped ephemeral link', () => {
    beforeEach(() => {
      deployment.auditInfo.authChain = buildAuthChain('ECDSA_SCOPED_EPHEMERAL')
    })

    it('should reject the deployment because the scoped link leaves no authority for the signed entity', async () => {
      const result = await validator.validate(deployment)

      expect(result).toEqual(
        validationFailed(
          'The signature is invalid. ERROR. Link type: ECDSA_SIGNED_ENTITY. Invalid signer address. ' +
            `Expected: . Actual: ${ephemeral.address.toLowerCase()}.`
        )
      )
    })
  })

  describe('and the auth chain is signed through an EIP-1654 scoped ephemeral link', () => {
    beforeEach(() => {
      deployment.auditInfo.authChain = buildAuthChain('ECDSA_EIP_1654_SCOPED_EPHEMERAL')
    })

    it('should reject the deployment because the scoped link leaves no authority for the signed entity', async () => {
      const result = await validator.validate(deployment)

      expect(result).toEqual(
        validationFailed(
          'The signature is invalid. ERROR. Link type: ECDSA_SIGNED_ENTITY. Invalid signer address. ' +
            `Expected: . Actual: ${ephemeral.address.toLowerCase()}.`
        )
      )
    })
  })
})
