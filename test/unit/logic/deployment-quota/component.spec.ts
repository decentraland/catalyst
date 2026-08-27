import { EntityType } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import { Registry } from 'prom-client'
import { Environment, EnvironmentConfig } from '../../../../src/Environment'
import { metricsDeclaration } from '../../../../src/metrics'
import {
  createDeploymentQuota,
  DeploymentQuotaExceededError,
  DeploymentQuotaWindow
} from '../../../../src/logic/deployment-quota'
import { IDeploymentQuota, QuotaClient } from '../../../../src/logic/deployment-quota/types'
import { createLogsMockedComponent } from '../../../mocks/logger-component-mock'

type QuotaConfig = {
  perMinute?: number
  perHour?: number
  perDay?: number
  perWeek?: number
  perMinuteByEntityType?: Map<EntityType, number>
  perHourByEntityType?: Map<EntityType, number>
  exemptIps?: string[]
  trustedClientIpHeader?: string
}

/** Every quota config set explicitly, so no test depends on a production default. */
function buildEnvironment(config: QuotaConfig): Environment {
  return new Environment()
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE, config.perMinute ?? 1000)
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR, config.perHour ?? 1000)
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_DAY, config.perDay ?? 1000)
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_WEEK, config.perWeek ?? 1000)
    .setConfig(
      EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE_BY_ENTITY_TYPE,
      config.perMinuteByEntityType ?? new Map()
    )
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR_BY_ENTITY_TYPE, config.perHourByEntityType ?? new Map())
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_DAY_BY_ENTITY_TYPE, new Map())
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_WEEK_BY_ENTITY_TYPE, new Map())
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_EXEMPT_IPS, config.exemptIps ?? [])
    .setConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_CACHE_MAX_KEYS, 1000)
    .setConfig(EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER, config.trustedClientIpHeader)
}

/** Only what the quota reads off a request, so no HTTP server or Web globals are involved. */
function buildClient(remoteAddress: string | undefined, headers: Record<string, string> = {}): QuotaClient {
  return {
    remoteAddress,
    request: { headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } }
  }
}

/** Rejects rather than throws, so a test asserts on an outcome instead of a control-flow shape. */
async function attempt(
  quota: IDeploymentQuota,
  client: QuotaClient,
  entityType: EntityType
): Promise<'allowed' | DeploymentQuotaExceededError> {
  try {
    await quota.assertWithinQuota(client, entityType)
    return 'allowed'
  } catch (error) {
    if (error instanceof DeploymentQuotaExceededError) {
      return error
    }
    throw error
  }
}

async function attemptTimes(
  quota: IDeploymentQuota,
  client: QuotaClient,
  entityType: EntityType,
  times: number
): Promise<('allowed' | DeploymentQuotaExceededError)[]> {
  const outcomes: ('allowed' | DeploymentQuotaExceededError)[] = []
  for (let index = 0; index < times; index++) {
    outcomes.push(await attempt(quota, client, entityType))
  }
  return outcomes
}

type AttemptSample = { labels: { entity_type: string; window: string; outcome: string }; value: number }

async function attemptSamples(registry: Registry): Promise<AttemptSample[]> {
  const metric = registry.getSingleMetric('dcl_content_deployment_quota_attempts_total')
  return ((await metric?.get())?.values ?? []) as AttemptSample[]
}

/** How many attempts were counted against one window, whatever the outcome. */
async function attemptsCountedForWindow(registry: Registry, window: DeploymentQuotaWindow): Promise<number> {
  return (await attemptSamples(registry))
    .filter((sample) => sample.labels.window === window)
    .reduce((total, sample) => total + sample.value, 0)
}

describe('when building the deployment quota', () => {
  let metrics: ReturnType<typeof createTestMetricsComponent<keyof typeof metricsDeclaration>>

  beforeEach(() => {
    metrics = createTestMetricsComponent(metricsDeclaration)
  })

  describe('and a longer window is tighter than a shorter one', () => {
    let env: Environment

    beforeEach(() => {
      env = buildEnvironment({ perMinute: 60, perHour: 10 })
    })

    it('should fail at startup rather than install a ladder whose minute budget is unreachable', () => {
      expect(() => createDeploymentQuota({ env, logs: createLogsMockedComponent(), metrics })).toThrow(
        'A longer window must not be tighter than a shorter one'
      )
    })
  })

  describe('and an exempt address is malformed', () => {
    let env: Environment

    beforeEach(() => {
      env = buildEnvironment({ exemptIps: ['198.51.100.0/24', 'not-an-ip'] })
    })

    it('should fail at startup rather than silently exempt nothing', () => {
      expect(() => createDeploymentQuota({ env, logs: createLogsMockedComponent(), metrics })).toThrow(
        'Invalid DEPLOYMENT_QUOTA_EXEMPT_IPS entry "not-an-ip"'
      )
    })
  })
})

describe('when a client attempts a deployment', () => {
  let metrics: ReturnType<typeof createTestMetricsComponent<keyof typeof metricsDeclaration>>
  let quota: IDeploymentQuota
  let client: QuotaClient

  const build = (config: QuotaConfig): IDeploymentQuota =>
    createDeploymentQuota({ env: buildEnvironment(config), logs: createLogsMockedComponent(), metrics })

  beforeEach(() => {
    metrics = createTestMetricsComponent(metricsDeclaration)
    client = buildClient('203.0.113.7')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and it stays within every window', () => {
    let outcomes: ('allowed' | DeploymentQuotaExceededError)[]

    beforeEach(async () => {
      quota = build({ perMinute: 3 })
      outcomes = await attemptTimes(quota, client, EntityType.SCENE, 3)
    })

    it('should allow every attempt', () => {
      expect(outcomes).toEqual(['allowed', 'allowed', 'allowed'])
    })
  })

  describe('and it exceeds the minute budget', () => {
    let outcome: 'allowed' | DeploymentQuotaExceededError
    let limitedSamples: AttemptSample[]

    beforeEach(async () => {
      quota = build({ perMinute: 2 })
      outcome = (await attemptTimes(quota, client, EntityType.SCENE, 3))[2]
      limitedSamples = (await attemptSamples(metrics.registry)).filter((sample) => sample.labels.outcome === 'limited')
    })

    it('should reject the attempt naming the minute window', () => {
      expect(outcome).toMatchObject({ window: DeploymentQuotaWindow.MINUTE, entityType: EntityType.SCENE, limit: 2 })
    })

    it('should carry a retry delay within the window it has to wait out', () => {
      expect((outcome as DeploymentQuotaExceededError).retryAfterSeconds).toBeGreaterThanOrEqual(1)
    })

    it('should report the rejection as a limited attempt on the entity type and the window', () => {
      expect(limitedSamples).toEqual([
        {
          labels: { entity_type: EntityType.SCENE, window: DeploymentQuotaWindow.MINUTE, outcome: 'limited' },
          value: 1
        }
      ])
    })
  })

  describe('and several windows hold the same budget it has just spent', () => {
    let outcome: 'allowed' | DeploymentQuotaExceededError

    beforeEach(async () => {
      // A burst can only ever trip the shortest window: the ladder is monotonic, so every longer
      // window's budget is at least as large and is reached later. The longer horizons bind a client
      // that paces itself across windows, which is why they exist.
      quota = build({ perMinute: 2, perHour: 2, perDay: 2, perWeek: 2 })
      outcome = (await attemptTimes(quota, client, EntityType.SCENE, 3))[2]
    })

    it('should reject the attempt naming the shortest of them', () => {
      expect(outcome).toMatchObject({ window: DeploymentQuotaWindow.MINUTE, limit: 2 })
    })
  })

  describe('and it keeps retrying after the minute budget is spent', () => {
    let minuteAttempts: number
    let hourAttempts: number

    beforeEach(async () => {
      quota = build({ perMinute: 1, perHour: 5 })
      await attemptTimes(quota, client, EntityType.SCENE, 4)
      minuteAttempts = await attemptsCountedForWindow(metrics.registry, DeploymentQuotaWindow.MINUTE)
      hourAttempts = await attemptsCountedForWindow(metrics.registry, DeploymentQuotaWindow.HOUR)
    })

    it('should stop at the blown window, leaving the longer budgets unspent by the retries', () => {
      expect(hourAttempts).toBe(1)
    })

    it('should still have counted every retry against the window that is already blown', () => {
      expect(minuteAttempts).toBe(4)
    })
  })

  describe('and the entity type has a tighter override', () => {
    let sceneOutcome: 'allowed' | DeploymentQuotaExceededError
    let profileOutcome: 'allowed' | DeploymentQuotaExceededError

    beforeEach(async () => {
      quota = build({ perMinute: 10, perMinuteByEntityType: new Map([[EntityType.SCENE, 1]]) })
      sceneOutcome = (await attemptTimes(quota, client, EntityType.SCENE, 2))[1]
      profileOutcome = await attempt(quota, client, EntityType.PROFILE)
    })

    it('should apply the override to that entity type', () => {
      expect(sceneOutcome).toMatchObject({ window: DeploymentQuotaWindow.MINUTE, limit: 1 })
    })

    it('should leave every other entity type on the window default', () => {
      expect(profileOutcome).toBe('allowed')
    })
  })

  describe('and another entity type has already spent its budget', () => {
    let outcome: 'allowed' | DeploymentQuotaExceededError

    beforeEach(async () => {
      quota = build({ perMinute: 1 })
      await attemptTimes(quota, client, EntityType.SCENE, 2)
      outcome = await attempt(quota, client, EntityType.PROFILE)
    })

    it('should still allow it, since the budgets are held per entity type', () => {
      expect(outcome).toBe('allowed')
    })
  })

  describe('and another address has already spent its budget', () => {
    let outcome: 'allowed' | DeploymentQuotaExceededError

    beforeEach(async () => {
      quota = build({ perMinute: 1 })
      await attemptTimes(quota, buildClient('198.51.100.1'), EntityType.SCENE, 2)
      outcome = await attempt(quota, client, EntityType.SCENE)
    })

    it('should still allow it, since the budgets are held per client address', () => {
      expect(outcome).toBe('allowed')
    })
  })

  describe('and the address is exempt', () => {
    let outcomes: ('allowed' | DeploymentQuotaExceededError)[]

    beforeEach(async () => {
      quota = build({ perMinute: 1, exemptIps: ['203.0.113.0/24'] })
      outcomes = await attemptTimes(quota, client, EntityType.SCENE, 5)
    })

    it('should allow every attempt, consuming no budget', () => {
      expect(outcomes).toEqual(['allowed', 'allowed', 'allowed', 'allowed', 'allowed'])
    })
  })

  describe('and no client address can be established', () => {
    let outcome: 'allowed' | DeploymentQuotaExceededError

    beforeEach(async () => {
      quota = build({ perMinute: 100 })
      outcome = (await attemptTimes(quota, buildClient(undefined), EntityType.SCENE, 11))[10]
    })

    it('should measure it against the shared bucket at a tightened cap rather than the full budget', () => {
      expect(outcome).toMatchObject({ window: DeploymentQuotaWindow.MINUTE, limit: 10 })
    })
  })
})

describe('when a trusted client IP header is configured', () => {
  let metrics: ReturnType<typeof createTestMetricsComponent<keyof typeof metricsDeclaration>>
  let quota: IDeploymentQuota

  beforeEach(() => {
    metrics = createTestMetricsComponent(metricsDeclaration)
    quota = createDeploymentQuota({
      env: buildEnvironment({ perMinute: 1, trustedClientIpHeader: 'x-real-ip' }),
      logs: createLogsMockedComponent(),
      metrics
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and two clients share a socket address but carry different header addresses', () => {
    let outcome: 'allowed' | DeploymentQuotaExceededError

    beforeEach(async () => {
      await attemptTimes(quota, buildClient('10.0.0.1', { 'x-real-ip': '203.0.113.7' }), EntityType.SCENE, 2)
      outcome = await attempt(quota, buildClient('10.0.0.1', { 'x-real-ip': '198.51.100.1' }), EntityType.SCENE)
    })

    it('should give each its own budget, taking the header over the proxy socket address', () => {
      expect(outcome).toBe('allowed')
    })
  })

  describe('and the header holds a value that is not an address', () => {
    let outcome: 'allowed' | DeploymentQuotaExceededError

    beforeEach(async () => {
      await attemptTimes(quota, buildClient('10.0.0.1', { 'x-real-ip': 'garbage' }), EntityType.SCENE, 2)
      outcome = await attempt(quota, buildClient('10.0.0.1', { 'x-real-ip': 'other-garbage' }), EntityType.SCENE)
    })

    it('should fall back to the socket address rather than let a caller mint buckets', () => {
      expect(outcome).toMatchObject({ window: DeploymentQuotaWindow.MINUTE })
    })
  })
})

describe('when no trusted client IP header is configured', () => {
  let metrics: ReturnType<typeof createTestMetricsComponent<keyof typeof metricsDeclaration>>
  let quota: IDeploymentQuota
  let outcome: 'allowed' | DeploymentQuotaExceededError

  beforeEach(async () => {
    metrics = createTestMetricsComponent(metricsDeclaration)
    quota = createDeploymentQuota({
      env: buildEnvironment({ perMinute: 1 }),
      logs: createLogsMockedComponent(),
      metrics
    })
    await attemptTimes(quota, buildClient('10.0.0.1', { 'x-forwarded-for': '203.0.113.7' }), EntityType.SCENE, 2)
    outcome = await attempt(quota, buildClient('10.0.0.1', { 'x-forwarded-for': '198.51.100.1' }), EntityType.SCENE)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should ignore a forwarding header a caller sent and keep both on the socket address budget', () => {
    expect(outcome).toMatchObject({ window: DeploymentQuotaWindow.MINUTE })
  })
})
