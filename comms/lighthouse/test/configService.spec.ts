import { Config, ConfigService, EnvironmentWrapper, LighthouseConfig } from '../src/config/configService'
import { ISimpleStorage } from '../src/config/simpleStorage'

describe('Config service', () => {
  it('When the config service is built, then environment takes precedence over all', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER

    const service = await buildServiceWith({
      env: envWrapperWith(config, '5'),
      storage: storageWith(config, 10),
      global: globalConfigWith(config, 15)
    })
    const value = service.get(config)

    expect(value).toEqual(5)
  })

  it('When the config service is built, then storage takes precedence over global and defaults', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: storageWith(config, 10),
      global: globalConfigWith(config, 15)
    })
    const value = service.get(config)

    expect(value).toEqual(10)
  })

  it('When the config service is built, then global takes precedence over defaults', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: emptyStorage(),
      global: globalConfigWith(config, 15)
    })
    const value = service.get(config)

    expect(value).toEqual(15)
  })

  it('When the config service is built and no values were set, then defaults are used', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: emptyStorage(),
      global: emptyGlobalConfig()
    })
    const value = service.get(config)

    expect(value).toEqual(config.defaultValue)
  })

  it('When global config is updated, then config service reports it correctly', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER
    const globalConfig = globalConfigWith(config, 20)

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: emptyStorage(),
      global: globalConfig
    })

    // Update global config
    globalConfig.setConfig(config, 30)
    await service.updateConfig()
    const value = service.get(config)

    expect(value).toEqual(30)
  })

  it('When storage config is updated, then config service reports it correctly', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER
    const storageConfig = storageWith(config, 20)

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: storageConfig,
      global: emptyGlobalConfig()
    })

    // Update storage config
    storageConfig.setConfig(config, 30)
    await service.updateConfig()
    const value = service.get(config)

    expect(value).toEqual(30)
  })

  it('When a change happens in global config, then the appropriate listener is called correctly', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER
    const globalConfig = globalConfigWith(config, 20)
    let listenedMaxPeers: number | undefined = undefined
    let listenedJoinDistance: number | undefined = undefined

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: emptyStorage(),
      global: globalConfig
    })

    // Add listeners
    service.listenTo(config, (newValue) => (listenedMaxPeers = newValue))
    service.listenTo(LighthouseConfig.ARCHIPELAGO_JOIN_DISTANCE, (newValue) => (listenedJoinDistance = newValue))

    // Update global config
    globalConfig.setConfig(config, 30)
    await service.updateConfig()

    expect(listenedMaxPeers!).toEqual(30)
    expect(listenedJoinDistance).toBeUndefined()
  })

  it('When a change happens in storage config, then the appropriate listener is called correctly', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER
    const storageConfig = storageWith(config, 20)
    let listenedMaxPeers: number | undefined = undefined
    let listenedJoinDistance: number | undefined = undefined

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: storageConfig,
      global: emptyGlobalConfig()
    })

    // Add listeners
    service.listenTo(config, (newValue) => (listenedMaxPeers = newValue))
    service.listenTo(LighthouseConfig.ARCHIPELAGO_JOIN_DISTANCE, (newValue) => (listenedJoinDistance = newValue))

    // Update storage config
    storageConfig.setConfig(config, 30)
    await service.updateConfig()

    expect(listenedMaxPeers!).toEqual(30)
    expect(listenedJoinDistance).toBeUndefined()
  })

  it('When storage config is deleted, then config service reports it correctly', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER
    const storageConfig = storageWith(config, 20)

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: storageConfig,
      global: emptyGlobalConfig()
    })

    // Delete storage config
    await service.updateStorageConfigs([{ key: config.name }])
    const value = service.get(config)

    expect(value).toEqual(config.defaultValue)
  })

  it('When global config is deleted, then config service reports it correctly', async () => {
    const config = LighthouseConfig.MAX_PEERS_PER_LAYER
    const globalConfig = globalConfigWith(config, 20)

    const service = await buildServiceWith({
      env: emptyWrapper(),
      storage: emptyStorage(),
      global: globalConfig
    })

    // Delete global config
    globalConfig.deleteConfig(config)
    await service.updateConfig()
    const value = service.get(config)

    expect(value).toEqual(config.defaultValue)
  })
})

function buildServiceWith({
  env,
  global,
  storage
}: {
  env: EnvironmentWrapper
  global: CustomGlobalConfig
  storage: CustomStorage
}): Promise<ConfigService> {
  return ConfigService.build({
    storage,
    globalConfig: { fetch: () => global.getAllConfig() },
    envWrapper: env
  })
}

function globalConfigWith<T>(config: LighthouseConfig<T>, value: T): CustomGlobalConfig {
  const globalConfig = emptyGlobalConfig()
  globalConfig.setConfig(config, value)
  return globalConfig
}

function emptyGlobalConfig(): CustomGlobalConfig {
  return new CustomGlobalConfig()
}

function emptyWrapper(): EnvironmentWrapper {
  return {
    isInEnv: (_) => false,
    readFromEnv: (_) => {
      throw new Error('Should never get here')
    }
  }
}

function envWrapperWith<T>(config: LighthouseConfig<T>, value: string): EnvironmentWrapper {
  return {
    isInEnv: (key) => key === LighthouseConfig.toEnvironmentName(config.name),
    readFromEnv: (_) => value
  }
}

function emptyStorage(): CustomStorage {
  return new CustomStorage()
}

function storageWith<T>(config: LighthouseConfig<T>, value: T): CustomStorage {
  const storage = emptyStorage()
  storage.setConfig(config, value)
  return storage
}

class CustomStorage implements ISimpleStorage {
  private readonly values: Config = {}
  setConfig<T>(config: LighthouseConfig<T>, value: T) {
    this.values[config.name] = value
  }

  getAll(): Promise<any> {
    return Promise.resolve(this.values)
  }
  setString(key: string, value: string): Promise<void> {
    this.values[key] = value
    return Promise.resolve()
  }
  deleteKey(key: string): Promise<void> {
    delete this.values[key]
    return Promise.resolve()
  }
  getString(key: string): Promise<string | undefined> {
    throw new Error('Method not implemented.')
  }
  getOrSetString(key: string, value: string): Promise<string | undefined> {
    throw new Error('Method not implemented.')
  }
  clear(): Promise<void> {
    throw new Error('Method not implemented.')
  }
}

class CustomGlobalConfig {
  private readonly values: Config = {}

  setConfig<T>(config: LighthouseConfig<T>, value: T) {
    this.values[config.name] = value
  }

  deleteConfig<T>(config: LighthouseConfig<T>) {
    delete this.values[config.name]
  }

  getAllConfig(): Promise<Config> {
    return Promise.resolve(this.values)
  }
}
