import { createTheGraphClient, L1Checker, L2Checker } from '@dcl/content-validator'
import { EntityType } from '@dcl/schemas'
import { createSynchronizer } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { IFetchComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { HTTPProvider } from 'eth-connect'
import ms from 'ms'
import path from 'path'
import { Controller } from './controller/Controller'
import { Environment, EnvironmentConfig } from './Environment'
import { FetcherFactory } from './helpers/FetcherFactory'
import { splitByCommaTrimAndRemoveEmptyElements } from './logic/config-helpers'
import { metricsDeclaration } from './metrics'
import { MigrationManagerFactory } from './migrations/MigrationManagerFactory'
import { createActiveEntitiesComponent } from './ports/activeEntities'
import { createClock } from './ports/clock'
import { createFileSystemContentStorage } from './ports/contentStorage/fileSystemContentStorage'
import { createDenylist } from './ports/denylist'
import { createDeployedEntitiesBloomFilter } from './ports/deployedEntitiesBloomFilter'
import { createDeployRateLimiter } from './ports/deployRateLimiterComponent'
import { createFailedDeployments } from './ports/failedDeployments'
import { createFetchComponent } from './ports/fetcher'
import { createFsComponent } from './ports/fs'
import { createDatabaseComponent } from './ports/postgres'
import { createProcessedSnapshotStorage } from './ports/processedSnapshotStorage'
import { createSequentialTaskExecutor } from './ports/sequecuentialTaskExecutor'
import { createSnapshotGenerator } from './ports/snapshotGenerator'
import { createSnapshotStorage } from './ports/snapshotStorage'
import { createSynchronizationState } from './ports/synchronizationState'
import { createSystemProperties } from './ports/system-properties'
import { ContentAuthenticator } from './service/auth/Authenticator'
import { GarbageCollectionManager } from './service/garbage-collection/GarbageCollectionManager'
import { PointerManager } from './service/pointers/PointerManager'
import { Server } from './service/Server'
import { MetaverseContentService } from './service/Service'
import { ServiceImpl } from './service/ServiceImpl'
import { SnapshotManager } from './service/snapshots/SnapshotManager'
import { createBatchDeployerComponent } from './service/synchronization/batchDeployer'
import { ChallengeSupervisor } from './service/synchronization/ChallengeSupervisor'
import { DAOClientFactory } from './service/synchronization/clients/DAOClientFactory'
import { ContentCluster } from './service/synchronization/ContentCluster'
import { createRetryFailedDeployments } from './service/synchronization/retryFailedDeployments'
import { createServerValidator } from './service/validations/server'
import { createExternalCalls, createSubGraphsComponent, createValidator } from './service/validations/validator'
import { AppComponents, ComponentsBuilder, EthersProvider, ICheckerContract } from './types'
import {
  checkerAbi,
  checkerContracts,
  collectionFactoryContracts,
  landContracts,
  registrarContracts,
  thirdPartyContracts
} from '@dcl/catalyst-contracts'
import { ethers } from 'ethers'
import { providers } from '@0xsequence/multicall'

const code = "0x608060405234801561001057600080fd5b506004361061004c5760003560e01c80633793d5e01461005157806361ff22301461008157806386cd85ca146100b1578063d1fe25d5146100e1575b600080fd5b61006b60048036038101906100669190610f30565b610111565b6040516100789190610fbf565b60405180910390f35b61009b600480360381019061009691906110a4565b6101c7565b6040516100a89190610fbf565b60405180910390f35b6100cb60048036038101906100c691906111d4565b61051f565b6040516100d89190610fbf565b60405180910390f35b6100fb60048036038101906100f69190611404565b610cec565b6040516101089190610fbf565b60405180910390f35b60008373ffffffffffffffffffffffffffffffffffffffff1663bef48ddf84846040518363ffffffff1660e01b815260040161014e9291906114c5565b602060405180830381865afa15801561016b573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061018f91906114fe565b73ffffffffffffffffffffffffffffffffffffffff168573ffffffffffffffffffffffffffffffffffffffff16149050949350505050565b6000806000905060005b811580156101e157508888905081105b1561050f5760008989838181106101fb576101fa61152b565b5b9050602002016020810190610210919061155a565b9050818061021d906115b6565b9250508073ffffffffffffffffffffffffffffffffffffffff1663c0300011896040518263ffffffff1660e01b8152600401610259919061160d565b602060405180830381865afa158015610276573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061029a9190611654565b6102a457506101d1565b60008873ffffffffffffffffffffffffffffffffffffffff166302d05d3f6040518163ffffffff1660e01b8152600401602060405180830381865afa1580156102f1573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061031591906114fe565b90508b73ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16141580156103ca57508873ffffffffffffffffffffffffffffffffffffffff16637682dfca8d6040518263ffffffff1660e01b8152600401610387919061160d565b602060405180830381865afa1580156103a4573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906103c89190611654565b155b801561044f57508873ffffffffffffffffffffffffffffffffffffffff1663be4763b3898e6040518363ffffffff1660e01b815260040161040c929190611690565b602060405180830381865afa158015610429573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061044d9190611654565b155b1561045b5750506101d1565b60008973ffffffffffffffffffffffffffffffffffffffff1663bfb231d28a6040518263ffffffff1660e01b815260040161049691906116b9565b600060405180830381865afa1580156104b3573d6000803e3d6000fd5b505050506040513d6000823e3d601f19601f820116820180604052508101906104dc9190611783565b9650505050505050808051906020012088886040516104fc9291906118a9565b60405180910390201494505050506101d1565b8192505050979650505050505050565b6000808573ffffffffffffffffffffffffffffffffffffffff16636fb7e58885856040518363ffffffff1660e01b815260040161055d9291906118d1565b602060405180830381865afa15801561057a573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061059e91906118fa565b905060008673ffffffffffffffffffffffffffffffffffffffff16636352211e836040518263ffffffff1660e01b81526004016105db91906116b9565b602060405180830381865afa1580156105f8573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061061c91906114fe565b90508773ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff160361065c57600192505050610ce3565b8573ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1603610a555760008673ffffffffffffffffffffffffffffffffffffffff1663bb969132846040518263ffffffff1660e01b81526004016106ca91906116b9565b602060405180830381865afa1580156106e7573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061070b91906118fa565b90508873ffffffffffffffffffffffffffffffffffffffff168773ffffffffffffffffffffffffffffffffffffffff16636352211e836040518263ffffffff1660e01b815260040161075d91906116b9565b602060405180830381865afa15801561077a573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061079e91906114fe565b73ffffffffffffffffffffffffffffffffffffffff16036107c55760019350505050610ce3565b8873ffffffffffffffffffffffffffffffffffffffff168773ffffffffffffffffffffffffffffffffffffffff1663081812fc836040518263ffffffff1660e01b815260040161081591906116b9565b602060405180830381865afa158015610832573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061085691906114fe565b73ffffffffffffffffffffffffffffffffffffffff160361087d5760019350505050610ce3565b8673ffffffffffffffffffffffffffffffffffffffff1663e985e9c5838b6040518363ffffffff1660e01b81526004016108b8929190611927565b602060405180830381865afa1580156108d5573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906108f99190611654565b1561090a5760019350505050610ce3565b8673ffffffffffffffffffffffffffffffffffffffff166307ecec3e838b6040518363ffffffff1660e01b8152600401610945929190611927565b602060405180830381865afa158015610962573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906109869190611654565b156109975760019350505050610ce3565b8873ffffffffffffffffffffffffffffffffffffffff168773ffffffffffffffffffffffffffffffffffffffff16639d40b850856040518263ffffffff1660e01b81526004016109e791906116b9565b602060405180830381865afa158015610a04573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610a2891906114fe565b73ffffffffffffffffffffffffffffffffffffffff1603610a4f5760019350505050610ce3565b50610cdc565b8773ffffffffffffffffffffffffffffffffffffffff168773ffffffffffffffffffffffffffffffffffffffff1663081812fc846040518263ffffffff1660e01b8152600401610aa591906116b9565b602060405180830381865afa158015610ac2573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610ae691906114fe565b73ffffffffffffffffffffffffffffffffffffffff1603610b0c57600192505050610ce3565b8673ffffffffffffffffffffffffffffffffffffffff1663e985e9c5828a6040518363ffffffff1660e01b8152600401610b47929190611927565b602060405180830381865afa158015610b64573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610b889190611654565b15610b9857600192505050610ce3565b8673ffffffffffffffffffffffffffffffffffffffff166307ecec3e828a6040518363ffffffff1660e01b8152600401610bd3929190611927565b602060405180830381865afa158015610bf0573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610c149190611654565b15610c2457600192505050610ce3565b8773ffffffffffffffffffffffffffffffffffffffff168773ffffffffffffffffffffffffffffffffffffffff16639d40b850846040518263ffffffff1660e01b8152600401610c7491906116b9565b602060405180830381865afa158015610c91573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610cb591906114fe565b73ffffffffffffffffffffffffffffffffffffffff1603610cdb57600192505050610ce3565b5b6000925050505b95945050505050565b60008373ffffffffffffffffffffffffffffffffffffffff16633b40f0b184876040518363ffffffff1660e01b8152600401610d29929190611994565b602060405180830381865afa158015610d46573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610d6a9190611654565b610d775760009050610e13565b6000808573ffffffffffffffffffffffffffffffffffffffff16634d61ca78866040518263ffffffff1660e01b8152600401610db391906119c4565b600060405180830381865afa158015610dd0573d6000803e3d6000fd5b505050506040513d6000823e3d601f19601f82011682018060405250810190610df991906119fb565b505050505091509150818015610e0e57508381145b925050505b949350505050565b6000604051905090565b600080fd5b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610e5a82610e2f565b9050919050565b610e6a81610e4f565b8114610e7557600080fd5b50565b600081359050610e8781610e61565b92915050565b6000610e9882610e4f565b9050919050565b610ea881610e8d565b8114610eb357600080fd5b50565b600081359050610ec581610e9f565b92915050565b600080fd5b600080fd5b600080fd5b60008083601f840112610ef057610eef610ecb565b5b8235905067ffffffffffffffff811115610f0d57610f0c610ed0565b5b602083019150836001820283011115610f2957610f28610ed5565b5b9250929050565b60008060008060608587031215610f4a57610f49610e25565b5b6000610f5887828801610e78565b9450506020610f6987828801610eb6565b935050604085013567ffffffffffffffff811115610f8a57610f89610e2a565b5b610f9687828801610eda565b925092505092959194509250565b60008115159050919050565b610fb981610fa4565b82525050565b6000602082019050610fd46000830184610fb0565b92915050565b60008083601f840112610ff057610fef610ecb565b5b8235905067ffffffffffffffff81111561100d5761100c610ed0565b5b60208301915083602082028301111561102957611028610ed5565b5b9250929050565b600061103b82610e4f565b9050919050565b61104b81611030565b811461105657600080fd5b50565b60008135905061106881611042565b92915050565b6000819050919050565b6110818161106e565b811461108c57600080fd5b50565b60008135905061109e81611078565b92915050565b600080600080600080600060a0888a0312156110c3576110c2610e25565b5b60006110d18a828b01610e78565b975050602088013567ffffffffffffffff8111156110f2576110f1610e2a565b5b6110fe8a828b01610fda565b965096505060406111118a828b01611059565b94505060606111228a828b0161108f565b935050608088013567ffffffffffffffff81111561114357611142610e2a565b5b61114f8a828b01610eda565b925092505092959891949750929550565b600061116b82610e4f565b9050919050565b61117b81611160565b811461118657600080fd5b50565b60008135905061119881611172565b92915050565b6000819050919050565b6111b18161119e565b81146111bc57600080fd5b50565b6000813590506111ce816111a8565b92915050565b600080600080600060a086880312156111f0576111ef610e25565b5b60006111fe88828901610e78565b955050602061120f88828901611189565b945050604061122088828901611189565b9350506060611231888289016111bf565b9250506080611242888289016111bf565b9150509295509295909350565b600061125a82610e4f565b9050919050565b61126a8161124f565b811461127557600080fd5b50565b60008135905061128781611261565b92915050565b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6112db82611292565b810181811067ffffffffffffffff821117156112fa576112f96112a3565b5b80604052505050565b600061130d610e1b565b905061131982826112d2565b919050565b600067ffffffffffffffff821115611339576113386112a3565b5b61134282611292565b9050602081019050919050565b82818337600083830152505050565b600061137161136c8461131e565b611303565b90508281526020810184848401111561138d5761138c61128d565b5b61139884828561134f565b509392505050565b600082601f8301126113b5576113b4610ecb565b5b81356113c584826020860161135e565b91505092915050565b6000819050919050565b6113e1816113ce565b81146113ec57600080fd5b50565b6000813590506113fe816113d8565b92915050565b6000806000806080858703121561141e5761141d610e25565b5b600061142c87828801610e78565b945050602061143d87828801611278565b935050604085013567ffffffffffffffff81111561145e5761145d610e2a565b5b61146a878288016113a0565b925050606061147b878288016113ef565b91505092959194509250565b600082825260208201905092915050565b60006114a48385611487565b93506114b183858461134f565b6114ba83611292565b840190509392505050565b600060208201905081810360008301526114e0818486611498565b90509392505050565b6000815190506114f881610e61565b92915050565b60006020828403121561151457611513610e25565b5b6000611522848285016114e9565b91505092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b6000602082840312156115705761156f610e25565b5b600061157e84828501611059565b91505092915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b60006115c18261106e565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036115f3576115f2611587565b5b600182019050919050565b61160781610e4f565b82525050565b600060208201905061162260008301846115fe565b92915050565b61163181610fa4565b811461163c57600080fd5b50565b60008151905061164e81611628565b92915050565b60006020828403121561166a57611669610e25565b5b60006116788482850161163f565b91505092915050565b61168a8161106e565b82525050565b60006040820190506116a56000830185611681565b6116b260208301846115fe565b9392505050565b60006020820190506116ce6000830184611681565b92915050565b60005b838110156116f25780820151818401526020810190506116d7565b60008484015250505050565b600061171161170c8461131e565b611303565b90508281526020810184848401111561172d5761172c61128d565b5b6117388482856116d4565b509392505050565b600082601f83011261175557611754610ecb565b5b81516117658482602086016116fe565b91505092915050565b60008151905061177d81611078565b92915050565b600080600080600080600060e0888a0312156117a2576117a1610e25565b5b600088015167ffffffffffffffff8111156117c0576117bf610e2a565b5b6117cc8a828b01611740565b97505060206117dd8a828b0161176e565b96505060406117ee8a828b0161176e565b95505060606117ff8a828b0161176e565b94505060806118108a828b016114e9565b93505060a088015167ffffffffffffffff81111561183157611830610e2a565b5b61183d8a828b01611740565b92505060c088015167ffffffffffffffff81111561185e5761185d610e2a565b5b61186a8a828b01611740565b91505092959891949750929550565b600081905092915050565b60006118908385611879565b935061189d83858461134f565b82840190509392505050565b60006118b6828486611884565b91508190509392505050565b6118cb8161119e565b82525050565b60006040820190506118e660008301856118c2565b6118f360208301846118c2565b9392505050565b6000602082840312156119105761190f610e25565b5b600061191e8482850161176e565b91505092915050565b600060408201905061193c60008301856115fe565b61194960208301846115fe565b9392505050565b600081519050919050565b600061196682611950565b6119708185611487565b93506119808185602086016116d4565b61198981611292565b840191505092915050565b600060408201905081810360008301526119ae818561195b565b90506119bd60208301846115fe565b9392505050565b600060208201905081810360008301526119de818461195b565b905092915050565b6000815190506119f5816113d8565b92915050565b600080600080600080600060e0888a031215611a1a57611a19610e25565b5b6000611a288a828b0161163f565b9750506020611a398a828b016119e6565b9650506040611a4a8a828b0161176e565b9550506060611a5b8a828b0161176e565b9450506080611a6c8a828b0161176e565b93505060a088015167ffffffffffffffff811115611a8d57611a8c610e2a565b5b611a998a828b01611740565b92505060c088015167ffffffffffffffff811115611aba57611ab9610e2a565b5b611ac68a828b01611740565b9150509295989194975092955056fea264697066735822122007490a5bbb4ab0f211c3d9ead7999706395349525aab6d736f398cff6a7f54fa64736f6c63430008110033"

class CustomProvider extends ethers.providers.JsonRpcProvider {
  private checkerStateOverride: any
  private checkerAddress: string
  constructor(url: string, network: string) {
    super(url)
    this.checkerAddress = checkerContracts[network]
    this.checkerStateOverride = { [this.checkerAddress]: { code } }
  }
  prepareRequest(method: string, params: any): [string, Array<any>] {
    if (method === 'call') {
      const hexlifyTransaction = ethers.utils.getStatic<
        (t: ethers.providers.TransactionRequest, a?: { [key: string]: boolean }) => { [key: string]: string }
      >(this.constructor, 'hexlifyTransaction')
      if (params.to === 'checkerAddress') {
        return [
          'eth_call',
          [hexlifyTransaction(params.transaction, { from: true }), params.blockTag, this.checkerStateOverride]
        ]
      } else {
        return ['eth_call', [hexlifyTransaction(params.transaction, { from: true }), params.blockTag]]
      }
    } else {
      return super.prepareRequest(method, params)
    }
  }
}

async function createCheckerContract(provider: any, network: string): Promise<ICheckerContract> {
  const multicallProvider = new providers.MulticallProvider(provider)
  const contract = new ethers.Contract(checkerContracts[network], checkerAbi, multicallProvider)
  return contract as any
}

export const defaultComponentsBuilder = {
  createEthConnectProvider(fetcher: IFetchComponent, network: string): HTTPProvider {
    return new HTTPProvider(`https://rpc.decentraland.org/${encodeURIComponent(network)}?project=catalyst-content`, {
      fetch: fetcher.fetch
    })
  },
  async createEthersProvider(network: string): Promise<EthersProvider> {
    return new CustomProvider(
      `https://rpc.decentraland.org/${encodeURIComponent(network)}?project=catalyst-content`,
      network
    )
  },
  async createL1Checker(provider: EthersProvider, network: string): Promise<L1Checker> {
    const checker = await createCheckerContract(provider, network)
    return {
      checkLAND(ethAddress: string, parcels: [number, number][], block: number): Promise<boolean[]> {
        const contracts = landContracts[network]
        return Promise.all(
          parcels.map(([x, y]) =>
            checker.checkLAND(ethAddress, contracts.landContractAddress, contracts.stateContractAddress, x, y, {
              blockTag: block
            })
          )
        )
      },
      checkNames(ethAddress: string, names: string[], block: number): Promise<boolean[]> {
        const registrar = registrarContracts[network]

        return Promise.all(names.map((name) => checker.checkName(ethAddress, registrar, name, { blockTag: block })))
      }
    }
  },
  async createL2Checker(provider: EthersProvider, network: string): Promise<L2Checker> {
    const checker = await createCheckerContract(provider, network)

    const { v2, v3 } = collectionFactoryContracts[network]

    const factories = [v2, v3]
    return {
      async validateWearables(
        ethAddress: string,
        contractAddress: string,
        assetId: string,
        hash: string,
        block: number
      ): Promise<boolean> {
        return checker.validateWearables(ethAddress, factories, contractAddress, assetId, hash, { blockTag: block })
      },
      validateThirdParty(ethAddress: string, tpId: string, root: Buffer, block: number): Promise<boolean> {
        const registry = thirdPartyContracts[network]
        return checker.validateThirdParty(ethAddress, registry, tpId, new Uint8Array(root), { blockTag: block })
      }
    }
  }
}

export async function initComponentsWithEnv(env: Environment, builder: ComponentsBuilder): Promise<AppComponents> {
  const clock = createClock()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const config = createConfigComponent({
    LOG_LEVEL: env.getConfig(EnvironmentConfig.LOG_LEVEL),
    IGNORE_BLOCKCHAIN_ACCESS_CHECKS: env.getConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS)
  })
  const logs = await createLogComponent({
    config
  })
  const fetcher = createFetchComponent()
  const fs = createFsComponent()
  const denylist = await createDenylist({ env, logs, fs, fetcher })
  const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const tmpDownloadFolder = path.join(contentStorageFolder, '_tmp')
  await fs.mkdir(tmpDownloadFolder, { recursive: true })
  const staticConfigs = {
    contentStorageFolder,
    tmpDownloadFolder
  }

  const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = ethNetwork === 'mainnet' ? 'polygon' : 'mumbai'
  const l1EthConnectProvider = builder.createEthConnectProvider(fetcher, ethNetwork)
  const l2EthConnectProvider = builder.createEthConnectProvider(fetcher, l2Network)
  const l1EthersProvider = await builder.createEthersProvider(ethNetwork)
  const l2EthersProvider = await builder.createEthersProvider(l2Network)
  const l1Checker = await builder.createL1Checker(l1EthersProvider, ethNetwork)
  const l2Checker = await builder.createL2Checker(l2EthersProvider, l2Network)

  const database = await createDatabaseComponent({ logs, env, metrics })

  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })

  const systemProperties = createSystemProperties({ database })

  const challengeSupervisor = new ChallengeSupervisor()

  const catalystFetcher = FetcherFactory.create({ env })
  const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const storage = await createFileSystemContentStorage({ fs }, contentFolder)

  const daoClient = await DAOClientFactory.create(env, l1EthConnectProvider)
  const authenticator = new ContentAuthenticator(
    l1EthConnectProvider,
    env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS)
  )

  const contentCluster = new ContentCluster(
    {
      daoClient,
      challengeSupervisor,
      fetcher,
      logs,
      env,
      clock
    },
    env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
  )

  // TODO: this should be in the src/logic folder. It is not a component
  const pointerManager = new PointerManager()

  const failedDeployments = await createFailedDeployments({ metrics, database })

  const deployRateLimiter = createDeployRateLimiter(
    { logs },
    {
      defaultTtl: env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL) ?? ms('1m'),
      defaultMax: env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX) ?? 300,
      entitiesConfigTtl:
        env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL) ?? new Map(),
      entitiesConfigMax:
        env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX) ?? new Map()
    }
  )

  const subGraphs = await createSubGraphsComponent({
    env,
    metrics,
    logs,
    fetcher,
    l1EthersProvider,
    l2EthersProvider,
    l1Checker,
    l2Checker
  })
  const externalCalls = await createExternalCalls({
    storage,
    authenticator,
    catalystFetcher,
    env,
    logs
  })
  const theGraphClient = createTheGraphClient({ subGraphs, logs })
  const validator = createValidator({ config, externalCalls, logs, theGraphClient, subGraphs })
  const serverValidator = createServerValidator({ failedDeployments, metrics, clock })

  const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs, clock })
  const activeEntities = createActiveEntitiesComponent({ database, env, logs, metrics, denylist, sequentialExecutor })

  const deployer: MetaverseContentService = new ServiceImpl({
    metrics,
    storage,
    failedDeployments,
    deployRateLimiter,
    pointerManager,
    validator,
    serverValidator,
    env,
    logs,
    authenticator,
    database,
    deployedEntitiesBloomFilter,
    activeEntities,
    denylist,
    clock
  })

  const snapshotManager = new SnapshotManager({ database, metrics, staticConfigs, logs, storage, denylist, fs, clock })

  const garbageCollectionManager = new GarbageCollectionManager(
    { deployer, systemProperties, metrics, logs, storage, database, clock },
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION),
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL)
  )

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const ignoredTypes = splitByCommaTrimAndRemoveEmptyElements(
    env.getConfig<string>(EnvironmentConfig.SYNC_IGNORED_ENTITY_TYPES)
  )

  const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })

  const batchDeployer = createBatchDeployerComponent(
    {
      logs,
      downloadQueue,
      fetcher,
      database,
      metrics,
      deployer,
      staticConfigs,
      deployedEntitiesBloomFilter: deployedEntitiesBloomFilter,
      storage,
      failedDeployments,
      clock
    },
    {
      ignoredTypes: new Set(ignoredTypes),
      queueOptions: {
        autoStart: true,
        concurrency: 10,
        timeout: 100000
      }
    }
  )

  const snapshotStorage = createSnapshotStorage({ database })

  const synchronizer = await createSynchronizer(
    {
      logs,
      downloadQueue,
      fetcher,
      metrics,
      deployer: batchDeployer,
      storage,
      processedSnapshotStorage,
      snapshotStorage
    },
    {
      // reconnection options
      bootstrapReconnection: {
        reconnectTime: 5000 /* five second */,
        reconnectRetryTimeExponent: 1.5,
        maxReconnectionTime: 3_600_000 /* one hour */
      },
      syncingReconnection: {
        reconnectTime: 1000 /* one second */,
        reconnectRetryTimeExponent: 1.2,
        maxReconnectionTime: 3_600_000 /* one hour */
      },

      // snapshot stream options
      tmpDownloadFolder: staticConfigs.tmpDownloadFolder,
      // download entities retry
      requestMaxRetries: 10,
      requestRetryWaitTime: 5000,

      // pointer chagnes stream options
      // time between every poll to /pointer-changes
      pointerChangesWaitTime: 5000
    }
  )

  const synchronizationState = createSynchronizationState({ logs })

  const retryFailedDeployments = createRetryFailedDeployments({
    env,
    metrics,
    staticConfigs,
    fetcher,
    downloadQueue,
    logs,
    deployer,
    contentCluster,
    failedDeployments,
    storage
  })

  const snapshotGenerator = createSnapshotGenerator({
    logs,
    fs,
    metrics,
    staticConfigs,
    storage,
    database,
    denylist,
    snapshotManager,
    clock
  })

  const controller = new Controller(
    {
      challengeSupervisor,
      snapshotManager,
      deployer,
      logs,
      metrics,
      database,
      sequentialExecutor,
      activeEntities,
      denylist,
      fs,
      snapshotGenerator,
      failedDeployments,
      contentCluster,
      synchronizationState
    },
    ethNetwork
  )

  const migrationManager = MigrationManagerFactory.create({ logs, env })

  env.logConfigValues(logs.getLogger('Environment'))

  const server = new Server({ controller, metrics, env, logs, fs })

  return {
    env,
    database,
    deployer,
    metrics,
    fetcher,
    logs,
    staticConfigs,
    batchDeployer,
    downloadQueue,
    deployedEntitiesBloomFilter,
    controller,
    synchronizer,
    synchronizationState,
    challengeSupervisor,
    snapshotManager,
    contentCluster,
    failedDeployments,
    deployRateLimiter,
    pointerManager,
    storage,
    authenticator,
    migrationManager,
    externalCalls,
    validator,
    serverValidator,
    garbageCollectionManager,
    systemProperties,
    catalystFetcher,
    daoClient,
    server,
    retryFailedDeployments,
    activeEntities,
    sequentialExecutor,
    denylist,
    l1EthConnectProvider,
    l2EthConnectProvider,
    l1EthersProvider,
    l2EthersProvider,
    l1Checker,
    l2Checker,
    fs,
    snapshotGenerator,
    processedSnapshotStorage,
    clock,
    snapshotStorage
  }
}
