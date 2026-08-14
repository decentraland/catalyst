import { EntityType, EthAddress } from '@dcl/schemas'
import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import ms from 'ms'
import { initComponentsWithEnv } from './components'
import { AppComponents, parseEntityType } from './types'

const DEFAULT_STORAGE_ROOT_FOLDER = 'storage'
const DEFAULT_HTTP_SERVER_PORT = 6969
const DEFAULT_HTTP_SERVER_HOST = '0.0.0.0'
const DEFAULT_DENYLIST_FILE_NAME = 'denylist.txt'
const DEFAULT_DENYLIST_URLS = 'https://asset-bundle-registry.decentraland.org/denylist'
const DECENTRALAND_ADDRESS: EthAddress = '0x1337e0507eb4ab47e08a179573ed4533d9e22a7b'

const DEFAULT_FOLDER_MIGRATION_MAX_CONCURRENCY = 1000
export const DEFAULT_ENTITIES_CACHE_SIZE = 150000
// Default for PG_POOL_SIZE: max connections for the main pg pool. Sized above the deployment job
// concurrency (batch deployer = 10) so concurrent deploy transactions — each holding a connection
// for its whole tx — can't starve the read endpoints of connections. pg's own default is 10.
export const DEFAULT_PG_POOL_SIZE = 20

/**
 * Parses the PG_POOL_SIZE env value: falls back to DEFAULT_PG_POOL_SIZE when unset or non-numeric,
 * and floors at 1 to avoid a degenerate 0/negative pool. Exported for testing.
 */
export function parsePgPoolSize(raw: string | undefined): number {
  const parsed = parseInt(raw ?? '', 10)
  return Number.isNaN(parsed) ? DEFAULT_PG_POOL_SIZE : Math.max(parsed, 1)
}
// HTTP-layer DoS guard for POST /entities uploads. The per-entity business limits live in
// `@dcl/content-validator` (e.g. 15 MB/parcel for scenes) and run *after* the body is buffered,
// so these caps only bound how much an unauthenticated client can stream into memory per request.
// Generous on purpose; tune via env on catalysts that accept very large multi-parcel scenes.
export const DEFAULT_MAX_UPLOAD_FILE_SIZE = 100 * 1024 * 1024 // 100 MB per file
export const DEFAULT_MAX_UPLOAD_FILE_COUNT = 3000
export const DEFAULT_MAX_UPLOAD_FIELD_COUNT = 100 // non-file form fields (e.g. entityId + auth-chain links)
export const DEFAULT_MAX_UPLOAD_FIELD_SIZE = 100 * 1024 // 100 KB per field value
// Cumulative cap across every file + field in a single upload. `MAX_UPLOAD_FILE_SIZE` bounds one
// file and `MAX_UPLOAD_FILE_COUNT` bounds the count, but their product (the only implicit ceiling)
// is huge, and this wrapper buffers files in memory — so without a total cap one request could try
// to buffer hundreds of GB. The validator's size check is *per pointer*, so a legitimate multi-parcel
// scene can be several GB; this default is deliberately generous (and `MAX_UPLOAD_TOTAL_SIZE`-tunable)
// to bound the pathological case without rejecting large estate deployments. Streaming uploads to
// disk (instead of buffering) would remove the memory exposure entirely and is the proper follow-up.
export const DEFAULT_MAX_UPLOAD_TOTAL_SIZE = 2 * 1024 * 1024 * 1024 // 2 GiB total per request

// Body cap for the JSON endpoints that buffer the whole request into memory before validating it
// (POST /entities/active). The schema's `maxItems: 1000` can't help because JSON parsing happens
// before validation, so without this an unauthenticated client can stream an arbitrarily large body
// and OOM the process. 10 MB comfortably fits 1000 pointer/id strings.
export const DEFAULT_MAX_ACTIVE_ENTITIES_BODY_SIZE = 10 * 1024 * 1024 // 10 MB

// Per-client request budget for POST /entities. This is the only unauthenticated endpoint that
// buffers a multi-MB upload into memory before anything can reject it, and neither existing guard
// covers the case: the `DEPLOYMENT_RATE_LIMIT_*` knobs below throttle redeployments of the same
// *pointer* (after validation, per entity type), and nginx's `limit_req` zones are keyed on `$uri`,
// so they bound an endpoint's total rate rather than any one client's share of it.
export const DEFAULT_POST_ENTITIES_RATE_LIMIT_MAX = 200
export const DEFAULT_POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * Parse a non-negative integer env var, falling back to `defaultValue` when it is unset/empty.
 * Throws on an invalid value (including partial parses like "256MB") rather than letting `parseInt`
 * return a truncated number or `NaN`: consumers such as busboy treat `NaN` as "no limit" and library
 * validators (lru-cache, p-queue, prom-client) throw on a non-integer, either of which turns a
 * mistyped env var into a silently-disabled cap or a startup crash.
 */
function parseNonNegativeIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return defaultValue
  }
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${name}: expected a non-negative integer but got "${raw}"`)
  }
  const parsed = parseInt(trimmed, 10)
  // Reject values that don't round-trip through a JS number (> 2^53): parseInt would silently lose
  // precision, enforcing a cap different from what the operator typed.
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${name}: value "${raw}" is too large to represent exactly`)
  }
  return parsed
}

/**
 * Like `parseNonNegativeIntEnv` but rejects `0`. For a rate limit neither bound may be zero: a `max`
 * of 0 rejects every request and a window of 0 is not a window at all. Flooring up to 1 (as
 * `ENTITIES_CACHE_SIZE` does) would turn a typo into a 1-request-per-window outage that looks like
 * working configuration, so a bad value fails startup while it is still cheap to notice.
 */
function parsePositiveIntEnv(name: string, defaultValue: number): number {
  const parsed = parseNonNegativeIntEnv(name, defaultValue)
  if (parsed === 0) {
    throw new Error(`Invalid ${name}: expected a positive integer but got "${process.env[name]}"`)
  }
  return parsed
}

/**
 * Reads an optional HTTP header name, returning `undefined` when unset/empty so the consumer keeps
 * its own default. Trimmed because a padded header name is not merely unmatched — `Headers.get`
 * rejects it outright.
 */
function parseOptionalHeaderNameEnv(name: string): string | undefined {
  const trimmed = process.env[name]?.trim()
  if (trimmed === undefined || trimmed === '') {
    return undefined
  }
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(trimmed)) {
    throw new Error(`Invalid ${name}: expected an HTTP header name but got "${process.env[name]}"`)
  }
  return trimmed
}

/**
 * Like `parseNonNegativeIntEnv` but returns `undefined` when the var is unset/empty, so the consumer
 * can fall back to its own (library) default. Still throws on a malformed value.
 */
function parseOptionalNonNegativeIntEnv(name: string): number | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return undefined
  }
  return parseNonNegativeIntEnv(name, 0)
}

/**
 * Parse a duration env var (e.g. "6h", "30m", or a plain-millisecond string) into milliseconds,
 * falling back to `defaultValue` when unset/empty. Throws on an unparseable value instead of
 * forwarding a raw string or `NaN` to consumers (`setTimeout`, the job scheduler) that would
 * silently degrade into a ~1ms hot loop.
 */
function parseMsEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') {
    return defaultValue
  }
  const value = ms(raw)
  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`Invalid ${name}: expected a duration (e.g. "6h") but got "${raw}"`)
  }
  return value
}
export const DEFAULT_ETH_NETWORK = 'sepolia'

export const DEFAULT_ENS_OWNER_PROVIDER_URL_TESTNET =
  'https://api.studio.thegraph.com/query/49472/marketplace-sepolia/version/latest'
const DEFAULT_ENS_OWNER_PROVIDER_URL_MAINNET = 'https://subgraph.decentraland.org/marketplace'
export const DEFAULT_LAND_MANAGER_SUBGRAPH_TESTNET =
  'https://api.studio.thegraph.com/query/49472/land-manager-sepolia/version/latest'
export const DEFAULT_LAND_MANAGER_SUBGRAPH_MAINNET = 'https://subgraph.decentraland.org/land-manager'
export const DEFAULT_COLLECTIONS_SUBGRAPH_TESTNET =
  'https://api.studio.thegraph.com/query/49472/collections-ethereum-sepolia/version/latest'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MAINNET = 'https://subgraph.decentraland.org/collections-ethereum-mainnet'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MAINNET = 'https://subgraph.decentraland.org/collections-matic-mainnet'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_AMOY = 'https://subgraph.decentraland.org/collections-matic-amoy'
export const DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_AMOY = 'https://subgraph.decentraland.org/tpr-matic-amoy'
export const DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_MAINNET = 'https://subgraph.decentraland.org/tpr-matic-mainnet'
export const DEFAULT_BLOCKS_SUBGRAPH_TESTNET =
  'https://api.studio.thegraph.com/query/49472/blocks-ethereum-sepolia/version/latest'
export const DEFAULT_BLOCKS_SUBGRAPH_MAINNET = 'https://subgraph.decentraland.org/blocks-ethereum-mainnet'
export const DEFAULT_BLOCKS_SUBGRAPH_MATIC_AMOY =
  'https://api.studio.thegraph.com/query/49472/blocks-matic-amoy/version/latest'
export const DEFAULT_BLOCKS_SUBGRAPH_MATIC_MAINNET = 'https://subgraph.decentraland.org/blocks-matic-mainnet'

export const CURRENT_COMMIT_HASH = process.env.COMMIT_HASH ?? 'Unknown'
export const CURRENT_VERSION = process.env.CURRENT_VERSION ?? 'Unknown'
export const DEFAULT_DATABASE_CONFIG = {
  password: '12345678',
  user: 'postgres',
  database: 'content',
  host: 'localhost',
  schema: 'public',
  port: 5432
}
const DEFAULT_SYNC_STREAM_TIMEOUT = '10m'

export class Environment implements IConfigComponent {
  private configs: Map<EnvironmentConfig, any>

  constructor(otherEnv?: Environment) {
    this.configs = otherEnv ? new Map(otherEnv.configs) : new Map()
  }

  getConfig<T>(key: EnvironmentConfig): T {
    return this.configs.get(key)
  }

  setConfig<T>(key: EnvironmentConfig, value: T): Environment {
    this.configs.set(key, value)
    return this
  }

  getString(name: string): Promise<string | undefined> {
    const key = EnvironmentConfig[name as keyof typeof EnvironmentConfig]
    const value = key !== undefined ? this.getConfig(key) : undefined
    // Fall back to the raw env var for keys not modelled in EnvironmentConfig (e.g.
    // WKC_METRICS_BEARER_TOKEN, read by the http-server instrumentation to guard /metrics).
    // Without this such keys resolve to `undefined` no matter what the operator sets.
    return (value ?? process.env[name]) as any
  }

  getNumber(name: string): Promise<number | undefined> {
    return this.getConfig(EnvironmentConfig[name])
  }

  async requireString(name: string): Promise<string> {
    const value = await this.getString(name)
    if (value === undefined) {
      throw new Error('Configuration: string ' + name + ' is required')
    }
    return value
  }

  async requireNumber(name: string): Promise<number> {
    const value = await this.getNumber(name)
    if (value === undefined) {
      throw new Error('Configuration: string ' + name + ' is required')
    }
    return value
  }

  logConfigValues(logger: ILoggerComponent.ILogger): void {
    logger.info('These are the configuration values:')
    // Provider/subgraph URLs commonly embed an API key in the path or userinfo (Infura, The Graph
    // gateway), so they are redacted alongside the DB credentials to keep secrets out of logs.
    const sensitiveEnvs = [
      EnvironmentConfig.PSQL_PASSWORD,
      EnvironmentConfig.PSQL_USER,
      EnvironmentConfig.L1_HTTP_PROVIDER_URL,
      EnvironmentConfig.L2_HTTP_PROVIDER_URL,
      EnvironmentConfig.ENS_OWNER_PROVIDER_URL,
      EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL,
      EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL,
      EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL,
      EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL,
      EnvironmentConfig.BLOCKS_L1_SUBGRAPH_URL,
      EnvironmentConfig.BLOCKS_L2_SUBGRAPH_URL
    ]
    for (const [config, value] of this.configs.entries()) {
      if (!sensitiveEnvs.includes(config)) {
        logger.info(`${EnvironmentConfig[config]}: ${this.printObject(value)}`)
      }
    }
  }

  private printObject(object: any) {
    if (object instanceof Map) {
      let mapString: string = '{'
      object.forEach((value: string, key: string) => {
        mapString += `'${key}': ${value},`
      })
      mapString += '}'
      return mapString
    } else {
      return JSON.stringify(object)
    }
  }
}

export enum EnvironmentConfig {
  STORAGE_ROOT_FOLDER,
  HTTP_SERVER_PORT,
  HTTP_SERVER_HOST,
  LOG_REQUESTS,
  UPDATE_FROM_DAO_INTERVAL,
  DECENTRALAND_ADDRESS,
  ADDITIONAL_DECENTRALAND_ADDRESS,
  DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL,
  DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX,
  ETH_NETWORK,
  LOG_LEVEL,
  FETCH_REQUEST_TIMEOUT,
  USE_COMPRESSION_MIDDLEWARE,
  BOOTSTRAP_FROM_SCRATCH,
  REQUEST_TTL_BACKWARDS,
  ENS_OWNER_PROVIDER_URL,
  LAND_MANAGER_SUBGRAPH_URL,
  COLLECTIONS_L1_SUBGRAPH_URL,
  COLLECTIONS_L2_SUBGRAPH_URL,
  THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL,
  PSQL_PASSWORD,
  PSQL_USER,
  PSQL_DATABASE,
  PSQL_HOST,
  PSQL_SCHEMA,
  PSQL_PORT,
  PG_IDLE_TIMEOUT,
  PG_QUERY_TIMEOUT,
  PG_STREAM_QUERY_TIMEOUT,
  PG_POOL_SIZE,
  GARBAGE_COLLECTION,
  GARBAGE_COLLECTION_INTERVAL,
  BLOOM_FILTER_EXPECTED_ELEMENTS,
  SEQUENTIAL_TASK_CONCURRENCY,
  ENTITIES_CACHE_CONTROL_MAX_AGE,
  PROFILE_DURATION,
  SNAPSHOT_FREQUENCY_IN_MILLISECONDS,
  CUSTOM_DAO,
  DISABLE_SYNCHRONIZATION,
  SYNC_STREAM_TIMEOUT,
  CONTENT_SERVER_ADDRESS,
  ENTITIES_CACHE_SIZE,
  BLOCKS_L1_SUBGRAPH_URL,
  BLOCKS_L2_SUBGRAPH_URL,
  VALIDATE_API,
  FOLDER_MIGRATION_MAX_CONCURRENCY,
  RETRY_FAILED_DEPLOYMENTS_DELAY_TIME,
  DEPLOYMENT_RATE_LIMIT_TTL,
  DEPLOYMENT_RATE_LIMIT_MAX,
  DENYLIST_FILE_NAME,
  DENYLIST_URLS,
  READ_ONLY,
  MAX_UPLOAD_FILE_SIZE,
  MAX_UPLOAD_FILE_COUNT,
  MAX_UPLOAD_FIELD_COUNT,
  MAX_UPLOAD_FIELD_SIZE,
  MAX_UPLOAD_TOTAL_SIZE,
  MAX_ACTIVE_ENTITIES_BODY_SIZE,

  // Per-client rate limit on POST /entities. The header is deliberately not scoped to this endpoint:
  // it describes where this process sits in the network, so any future limiter reads the same one.
  POST_ENTITIES_RATE_LIMIT_MAX,
  POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS,
  TRUSTED_CLIENT_IP_HEADER,

  SUBGRAPH_COMPONENT_RETRIES,
  SUBGRAPH_COMPONENT_QUERY_TIMEOUT,

  // Sync throughput knobs (parallel remote-entity downloads / deploys during bootstrap and catch-up)
  SYNC_DOWNLOAD_CONCURRENCY,
  SYNC_DEPLOY_CONCURRENCY,

  // Max concurrent content-file size fetches during deployment size validation (default 1 = sequential)
  CONTENT_SIZE_FETCH_CONCURRENCY,

  // List of entity types ignored during the synchronization
  SYNC_IGNORED_ENTITY_TYPES,
  IGNORE_BLOCKCHAIN_ACCESS_CHECKS,
  L1_HTTP_PROVIDER_URL,
  L2_HTTP_PROVIDER_URL,

  // Decompression cache settings for folder-based storage
  STORAGE_DECOMPRESS_CACHE_TTL,
  STORAGE_DECOMPRESS_CACHE_MAX_SIZE,
  STORAGE_DECOMPRESS_CACHE_EVICTION_INTERVAL,
  // Max bytes a single gzip content file may inflate to (decompression-bomb guard).
  // Undefined falls back to the library default (256MB).
  STORAGE_DECOMPRESS_MAX_FILE_SIZE
}
export class EnvironmentBuilder {
  private baseEnv: Environment
  constructor(other?: Environment) {
    if (other) {
      this.baseEnv = new Environment(other)
    } else {
      this.baseEnv = new Environment()
    }
  }

  withConfig(config: EnvironmentConfig, value: any): EnvironmentBuilder {
    this.baseEnv.setConfig(config, value)
    return this
  }

  async buildConfigAndComponents(): Promise<AppComponents> {
    return await initComponentsWithEnv(await this.build())
  }

  async build(): Promise<Environment> {
    const env = new Environment()

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.STORAGE_ROOT_FOLDER,
      () => process.env.STORAGE_ROOT_FOLDER ?? DEFAULT_STORAGE_ROOT_FOLDER
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DENYLIST_FILE_NAME,
      () => process.env.DENYLIST_FILE_NAME ?? DEFAULT_DENYLIST_FILE_NAME
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DENYLIST_URLS,
      () => process.env.DENYLIST_URLS ?? DEFAULT_DENYLIST_URLS
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SYNC_IGNORED_ENTITY_TYPES,
      () => process.env.SYNC_IGNORED_ENTITY_TYPES ?? ''
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY, () =>
      parseNonNegativeIntEnv('FOLDER_MIGRATION_MAX_CONCURRENCY', DEFAULT_FOLDER_MIGRATION_MAX_CONCURRENCY)
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.HTTP_SERVER_PORT, () =>
      parseNonNegativeIntEnv('HTTP_SERVER_PORT', DEFAULT_HTTP_SERVER_PORT)
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_REQUESTS, () => process.env.LOG_REQUESTS !== 'false')
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL, () =>
      parseMsEnv('UPDATE_FROM_DAO_INTERVAL', ms('30m'))
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DECENTRALAND_ADDRESS, () => DECENTRALAND_ADDRESS)
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ADDITIONAL_DECENTRALAND_ADDRESS,
      () => process.env.ADDITIONAL_DECENTRALAND_ADDRESS
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL, () =>
      Math.floor(ms((process.env.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL ?? '1m') as string) / 1000)
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX, () =>
      parseNonNegativeIntEnv('DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX', 300)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ETH_NETWORK,
      () => process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_LEVEL, () => process.env.LOG_LEVEL ?? 'INFO')
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.FETCH_REQUEST_TIMEOUT,
      () => process.env.FETCH_REQUEST_TIMEOUT ?? '2m'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE,
      () => process.env.USE_COMPRESSION_MIDDLEWARE === 'true'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH,
      () => process.env.BOOTSTRAP_FROM_SCRATCH === 'true'
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.REQUEST_TTL_BACKWARDS, () =>
      parseMsEnv('REQUEST_TTL_BACKWARDS', ms('20m'))
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ENS_OWNER_PROVIDER_URL,
      () =>
        process.env.ENS_OWNER_PROVIDER_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_ENS_OWNER_PROVIDER_URL_MAINNET
          : DEFAULT_ENS_OWNER_PROVIDER_URL_TESTNET)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL,
      () =>
        process.env.LAND_MANAGER_SUBGRAPH_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? DEFAULT_LAND_MANAGER_SUBGRAPH_MAINNET
          : DEFAULT_LAND_MANAGER_SUBGRAPH_TESTNET)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL,
      () =>
        process.env.COLLECTIONS_L1_SUBGRAPH_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? DEFAULT_COLLECTIONS_SUBGRAPH_MAINNET
          : DEFAULT_COLLECTIONS_SUBGRAPH_TESTNET)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL,
      () =>
        process.env.COLLECTIONS_L2_SUBGRAPH_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MAINNET
          : DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_AMOY)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL,
      () =>
        process.env.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_MAINNET
          : DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_AMOY)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.BLOCKS_L1_SUBGRAPH_URL,
      () =>
        process.env.BLOCKS_L1_SUBGRAPH_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? DEFAULT_BLOCKS_SUBGRAPH_MAINNET
          : DEFAULT_BLOCKS_SUBGRAPH_TESTNET)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.BLOCKS_L2_SUBGRAPH_URL,
      () =>
        process.env.BLOCKS_L2_SUBGRAPH_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_BLOCKS_SUBGRAPH_MATIC_MAINNET
          : DEFAULT_BLOCKS_SUBGRAPH_MATIC_AMOY)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_PASSWORD,
      () => process.env.POSTGRES_CONTENT_PASSWORD ?? DEFAULT_DATABASE_CONFIG.password
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_USER,
      () => process.env.POSTGRES_CONTENT_USER ?? DEFAULT_DATABASE_CONFIG.user
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_DATABASE,
      () => process.env.POSTGRES_CONTENT_DB ?? DEFAULT_DATABASE_CONFIG.database
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_HOST,
      () => process.env.POSTGRES_HOST ?? DEFAULT_DATABASE_CONFIG.host
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_SCHEMA,
      () => process.env.POSTGRES_SCHEMA ?? DEFAULT_DATABASE_CONFIG.schema
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PSQL_PORT, () =>
      parseNonNegativeIntEnv('POSTGRES_PORT', DEFAULT_DATABASE_CONFIG.port)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.GARBAGE_COLLECTION,
      () => process.env.GARBAGE_COLLECTION === 'true'
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL, () =>
      parseMsEnv('GARBAGE_COLLECTION_INTERVAL', ms('6h'))
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.BLOOM_FILTER_EXPECTED_ELEMENTS, () => {
      const parsed = parseInt(process.env.BLOOM_FILTER_EXPECTED_ELEMENTS ?? '', 10)
      // Floor at 1: a 0/negative value would make BloomFilter.create() a degenerate 0-size filter.
      return Number.isNaN(parsed) ? 10_000_000 : Math.max(parsed, 1)
    })
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SEQUENTIAL_TASK_CONCURRENCY, () => {
      const parsed = parseInt(process.env.SEQUENTIAL_TASK_CONCURRENCY ?? '', 10)
      return Number.isNaN(parsed) ? 1 : parsed
    })
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ENTITIES_CACHE_CONTROL_MAX_AGE, () => {
      // parseInt (not `|| default`) so an explicit 0 — which disables the Cache-Control header — is preserved.
      const parsed = parseInt(process.env.ENTITIES_CACHE_CONTROL_MAX_AGE ?? '', 10)
      return Number.isNaN(parsed) ? 10 : parsed
    })
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PROFILE_DURATION, () => {
      if (!process.env.PROFILE_DURATION) return ms('1 year')
      const value = ms(process.env.PROFILE_DURATION)
      if (value === undefined) throw new Error(`Invalid PROFILE_DURATION value: "${process.env.PROFILE_DURATION}"`)
      return value
    })

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PG_IDLE_TIMEOUT, () =>
      process.env.PG_IDLE_TIMEOUT ? ms(process.env.PG_IDLE_TIMEOUT) : ms('30s')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PG_QUERY_TIMEOUT, () =>
      process.env.PG_QUERY_TIMEOUT ? ms(process.env.PG_QUERY_TIMEOUT) : ms('1m')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PG_STREAM_QUERY_TIMEOUT, () =>
      process.env.PG_STREAM_QUERY_TIMEOUT ? ms(process.env.PG_STREAM_QUERY_TIMEOUT) : ms('10m')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PG_POOL_SIZE, () =>
      parsePgPoolSize(process.env.PG_POOL_SIZE)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS,
      () => process.env.SNAPSHOT_FREQUENCY_IN_MILLISECONDS ?? ms('6h')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.CUSTOM_DAO, () => process.env.CUSTOM_DAO)

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DISABLE_SYNCHRONIZATION,
      () => process.env.DISABLE_SYNCHRONIZATION === 'true'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SYNC_STREAM_TIMEOUT,
      () => process.env.SYNC_STREAM_TIMEOUT || DEFAULT_SYNC_STREAM_TIMEOUT
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.CONTENT_SERVER_ADDRESS,
      () =>
        process.env.CONTENT_SERVER_ADDRESS ||
        'http://127.0.0.1:' + env.getConfig<number>(EnvironmentConfig.HTTP_SERVER_PORT).toString()
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.HTTP_SERVER_HOST,
      () => process.env.HTTP_SERVER_HOST || DEFAULT_HTTP_SERVER_HOST
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ENTITIES_CACHE_SIZE, () =>
      // Floored at 1: lru-cache rejects a 0/negative `max` at construction.
      Math.max(1, parseNonNegativeIntEnv('ENTITIES_CACHE_SIZE', DEFAULT_ENTITIES_CACHE_SIZE))
    )

    /*
     * These are configured as 'DEPLOYMENT_RATE_LIMIT_MAX_{ENTITY_TYPE}=MAX_SIZE'.
     * For example: 'DEPLOYMENT_RATE_LIMIT_MAX_PROFILE=300'
     */
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX, () => {
      const rateLimitMaxConfig: Map<EntityType, number> = new Map(
        Object.entries(process.env)
          .filter(([name, value]) => name.startsWith('DEPLOYMENT_RATE_LIMIT_MAX_') && !!value)
          .map(([name]) => {
            // Strict parse (same rules as parseNonNegativeIntEnv, which reads process.env[name]) so a
            // mistyped value like "1_000" or "256MB" is rejected rather than silently truncated to a
            // far-too-low rate-limit cap.
            const parsed = parseNonNegativeIntEnv(name, 0)
            return [parseEntityType(name.replace('DEPLOYMENT_RATE_LIMIT_MAX_', '')) as EntityType, parsed]
          })
      )
      return rateLimitMaxConfig ?? new Map()
    })
    /*
     * These are configured as 'DEPLOYMENT_RATE_LIMIT_TTL_{ENTITY_TYPE}=MAX_SIZE'.
     * For example: 'DEPLOYMENT_RATE_LIMIT_TTL_PROFILE=1m'
     */
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL, () => {
      const rateLimitTtlConfig: Map<EntityType, number> = new Map(
        Object.entries(process.env)
          .filter(([name, value]) => name.startsWith('DEPLOYMENT_RATE_LIMIT_TTL_') && !!value)
          .map(([name, value]) => [
            parseEntityType(name.replace('DEPLOYMENT_RATE_LIMIT_TTL_', '')) as EntityType,
            ms(value ?? '1m')
          ])
      )
      return rateLimitTtlConfig ?? new Map()
    })

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.VALIDATE_API, () => process.env.VALIDATE_API == 'true')

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME, () =>
      parseMsEnv('RETRY_FAILED_DEPLOYMENTS_DELAY_TIME', ms('15m'))
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.READ_ONLY, () => process.env.READ_ONLY == 'true')

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.MAX_UPLOAD_FILE_SIZE, () =>
      parseNonNegativeIntEnv('MAX_UPLOAD_FILE_SIZE', DEFAULT_MAX_UPLOAD_FILE_SIZE)
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.MAX_UPLOAD_FILE_COUNT, () =>
      parseNonNegativeIntEnv('MAX_UPLOAD_FILE_COUNT', DEFAULT_MAX_UPLOAD_FILE_COUNT)
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.MAX_UPLOAD_FIELD_COUNT, () =>
      parseNonNegativeIntEnv('MAX_UPLOAD_FIELD_COUNT', DEFAULT_MAX_UPLOAD_FIELD_COUNT)
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.MAX_UPLOAD_FIELD_SIZE, () =>
      parseNonNegativeIntEnv('MAX_UPLOAD_FIELD_SIZE', DEFAULT_MAX_UPLOAD_FIELD_SIZE)
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE, () =>
      parseNonNegativeIntEnv('MAX_UPLOAD_TOTAL_SIZE', DEFAULT_MAX_UPLOAD_TOTAL_SIZE)
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.MAX_ACTIVE_ENTITIES_BODY_SIZE, () =>
      // No flooring: createBodySizeLimitMiddleware rejects a value < 1 loudly at startup. Flooring a
      // mistaken 0 up to 1 would instead install a silent 1-byte cap that rejects every request.
      parseNonNegativeIntEnv('MAX_ACTIVE_ENTITIES_BODY_SIZE', DEFAULT_MAX_ACTIVE_ENTITIES_BODY_SIZE)
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_MAX, () =>
      parsePositiveIntEnv('POST_ENTITIES_RATE_LIMIT_MAX', DEFAULT_POST_ENTITIES_RATE_LIMIT_MAX)
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS, () =>
      parsePositiveIntEnv('POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS', DEFAULT_POST_ENTITIES_RATE_LIMIT_WINDOW_SECONDS)
    )

    // Unset is correct for a directly exposed server. Behind a proxy it must name the header that
    // proxy writes, or every client shares one bucket — see the startup warning in `components.ts`.
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER, () =>
      parseOptionalHeaderNameEnv('TRUSTED_CLIENT_IP_HEADER')
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS,
      () => process.env.IGNORE_BLOCKCHAIN_ACCESS_CHECKS
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.L1_HTTP_PROVIDER_URL,
      () =>
        process.env.L1_HTTP_PROVIDER_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? 'https://rpc.decentraland.org/mainnet?project=catalyst-content'
          : 'https://rpc.decentraland.org/sepolia?project=catalyst-content')
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.L2_HTTP_PROVIDER_URL,
      () =>
        process.env.L2_HTTP_PROVIDER_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? 'https://rpc.decentraland.org/polygon?project=catalyst-content'
          : 'https://rpc.decentraland.org/amoy?project=catalyst-content')
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SUBGRAPH_COMPONENT_RETRIES,
      () => process.env.SUBGRAPH_COMPONENT_RETRIES ?? '1'
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SUBGRAPH_COMPONENT_QUERY_TIMEOUT,
      () => process.env.SUBGRAPH_COMPONENT_QUERY_TIMEOUT ?? ms('1m')
    )
    // Parallel remote-entity download/deploy limits during sync. Default 10 (the previous hardcoded
    // value); floored at 1 so a mistaken 0 can't stall sync. Keep the deploy limit at or below the pg
    // pool size so synced deploys don't starve foreground reads of connections.
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SYNC_DOWNLOAD_CONCURRENCY, () =>
      Math.max(1, parseNonNegativeIntEnv('SYNC_DOWNLOAD_CONCURRENCY', 10))
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SYNC_DEPLOY_CONCURRENCY, () =>
      Math.max(1, parseNonNegativeIntEnv('SYNC_DEPLOY_CONCURRENCY', 10))
    )
    // Concurrency for content-file size fetches during size validation. Default 10 (matching
    // CONTENT_STORE_CONCURRENCY): only the sync path fetches these sizes, so this parallelizes
    // bootstrap/catch-up. Bounded, so a large content list can't fan out; peak concurrent fetches is
    // roughly SYNC_DEPLOY_CONCURRENCY x this. Set to 1 to restore the previous sequential behavior.
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.CONTENT_SIZE_FETCH_CONCURRENCY, () =>
      Math.max(1, parseNonNegativeIntEnv('CONTENT_SIZE_FETCH_CONCURRENCY', 10))
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.STORAGE_DECOMPRESS_CACHE_TTL, () =>
      process.env.STORAGE_DECOMPRESS_CACHE_TTL ? ms(process.env.STORAGE_DECOMPRESS_CACHE_TTL) : undefined
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.STORAGE_DECOMPRESS_CACHE_MAX_SIZE, () =>
      parseOptionalNonNegativeIntEnv('STORAGE_DECOMPRESS_CACHE_MAX_SIZE')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.STORAGE_DECOMPRESS_CACHE_EVICTION_INTERVAL, () =>
      process.env.STORAGE_DECOMPRESS_CACHE_EVICTION_INTERVAL
        ? ms(process.env.STORAGE_DECOMPRESS_CACHE_EVICTION_INTERVAL)
        : undefined
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.STORAGE_DECOMPRESS_MAX_FILE_SIZE, () =>
      parseOptionalNonNegativeIntEnv('STORAGE_DECOMPRESS_MAX_FILE_SIZE')
    )

    return env
  }

  private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
    env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
  }
}
