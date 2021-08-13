import { fetchJson } from 'dcl-catalyst-commons'
import ms from 'ms'
import { ISimpleStorage } from './simpleStorage'

export type ConfigKeyValue = {
  key: string
  value?: any
}

export class LighthouseConfig<T> {
  static readonly MAX_PEERS_PER_ISLAND: LighthouseConfig<number> = new LighthouseConfig({
    name: 'maxPeersPerIsland',
    fromText: parseInt,
    defaultValue: 100
  })

  static readonly ARCHIPELAGO_JOIN_DISTANCE: LighthouseConfig<number> = new LighthouseConfig({
    name: 'archipelagoJoinDistance',
    fromText: parseInt,
    defaultValue: 64
  })

  static readonly ARCHIPELAGO_LEAVE_DISTANCE: LighthouseConfig<number> = new LighthouseConfig({
    name: 'archipelagoLeaveDistance',
    fromText: parseInt,
    defaultValue: 80
  })

  static readonly ARCHIPELAGO_FLUSH_FREQUENCY: LighthouseConfig<number> = new LighthouseConfig({
    name: 'archipelagoFlushFrequency',
    fromText: parseFloat,
    defaultValue: 2.0
  })

  static readonly HIGH_LOAD_PEERS_COUNT: LighthouseConfig<number> = new LighthouseConfig({
    name: 'highLoadPeersCount',
    fromText: parseInt,
    defaultValue: 10000
  })

  static readonly PEERS_CHECK_INTERVAL: LighthouseConfig<number> = new LighthouseConfig({
    name: 'peersCheckInterval',
    fromText: parseInt,
    defaultValue: 60000
  })

  readonly name: string
  readonly fromText: (config: string) => T
  readonly defaultValue: T

  constructor({ name, fromText, defaultValue }: { name: string; fromText: (config: string) => T; defaultValue: T }) {
    this.name = name
    this.fromText = fromText
    this.defaultValue = defaultValue
  }

  static toEnvironmentName(name: string): string {
    return name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()
  }
}

/**
 * This service handles the lighthouse's configuration. There are four different levels of configuration, with the following precedence:
 * Environment config >> storage config >> global config >> default config
 */
export class ConfigService {
  private readonly listeners: Map<string, ((newValue: any) => void)[]> = new Map()
  private readonly config: Config = {}

  constructor(
    private readonly storage: ISimpleStorage,
    private readonly fetchGlobalConfig: () => Promise<Config>,
    private readonly envWrapper: EnvironmentWrapper
  ) {
    setInterval(() => this.updateConfig(), ms('15m'))
  }

  async updateStorageConfigs(configs: ConfigKeyValue[]) {
    for (const it of configs) {
      if (typeof it.value !== 'undefined') {
        await this.storage.setString(it.key, JSON.stringify(it.value))
      } else {
        await this.storage.deleteKey(it.key)
      }
    }

    await this.updateConfig()
    return this.getAllConfig()
  }

  listenTo<T>(config: LighthouseConfig<T>, listener: (newValue: T) => void): void {
    const listeners = this.listeners.get(config.name)
    if (listeners) {
      listeners.push(listener)
    } else {
      this.listeners.set(config.name, [listener])
    }
  }

  getAllConfig() {
    return this.config
  }

  get<T>(config: LighthouseConfig<T>): T {
    return this.config[config.name]
  }

  /**
   * This method reads storage and global config, and then updates the current on-memory registry.
   *
   * Note: visible for testing purposes
   */
  async updateConfig() {
    const storageConfig = await this.storage.getAll()
    const globalConfig = await this.fetchGlobalConfig()
    for (const [, config] of Object.entries(LighthouseConfig)) {
      const configName = config.name
      const configEnvironmentName = LighthouseConfig.toEnvironmentName(config.name)
      const currentConfigValue = this.config[config.name]
      let newConfigValue: any
      if (this.envWrapper.isInEnv(configEnvironmentName)) {
        newConfigValue = config.fromText(this.envWrapper.readFromEnv(configEnvironmentName))
      } else if (configName in storageConfig) {
        newConfigValue = JSON.parse(storageConfig[configName])
      } else if (configName in globalConfig) {
        newConfigValue = globalConfig[configName]
      } else {
        newConfigValue = config.defaultValue
      }
      if (currentConfigValue !== newConfigValue) {
        this.config[configName] = newConfigValue
        this.listeners.get(configName)?.forEach((listener) => listener(newConfigValue))
      }
    }
  }

  static async build(options: {
    storage: ISimpleStorage
    globalConfig: { ethNetwork: string } | { fetch: () => Promise<Config> }
    envWrapper?: EnvironmentWrapper
  }): Promise<ConfigService> {
    const globalConfig = options.globalConfig
    const service = new ConfigService(
      options.storage,
      'ethNetwork' in globalConfig ? () => fetchGlobalConfig(globalConfig.ethNetwork) : globalConfig.fetch,
      options.envWrapper ?? buildEnvWrapper()
    )
    await service.updateConfig()
    return service
  }
}

export type Config = Record<string, any>

export type EnvironmentWrapper = {
  isInEnv: (environmentKey: string) => boolean
  readFromEnv: (environmentKey: string) => string
}

function buildEnvWrapper(): EnvironmentWrapper {
  return {
    isInEnv: (environmentKey: string) => environmentKey in process.env,
    readFromEnv: (environmentKey: string) => process.env[environmentKey]!
  }
}

async function fetchGlobalConfig(ethNetwork: string): Promise<Config> {
  try {
    const tld = ethNetwork === 'mainnet' ? 'org' : 'zone'
    return await fetchJson(`https://config.decentraland.${tld}/catalyst.json`)
  } catch {
    return {}
  }
}
