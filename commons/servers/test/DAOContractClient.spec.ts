import { DAOContractClient } from 'decentraland-katalyst-commons/DAOClient'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata'
import { CatalystData, CatalystId, DAOContract } from 'decentraland-katalyst-contracts/DAOContract'
import { anyNumber, anyString, instance, mock, verify, when } from 'ts-mockito'

describe('DAOContractClient', () => {
  const id1: CatalystId = 'id1'
  const data1: CatalystData = { id: id1, owner: 'owner1', domain: 'domain.com' }
  const metadata1: ServerMetadata = { id: id1, owner: 'owner1', address: 'https://domain.com' }

  const id2: CatalystId = 'id2'
  const data2: CatalystData = { id: id2, owner: 'owner2', domain: 'domain.com' }
  const metadata2: ServerMetadata = { id: id2, owner: 'owner2', address: 'https://domain.com' }

  it(`When server was added, then changes are detected and reported`, async () => {
    const [, contractInstance] = contractWith([
      [id1, data1],
      [id2, data2]
    ])
    const client = new DAOContractClient(contractInstance, new Map([[id1, metadata1]]))

    const servers = await client.getAllServers()

    expect(servers).toEqual(new Set([metadata1, metadata2]))
  })

  it(`When server was removed, then changes are detected and reported`, async () => {
    const [, contractInstance] = contractWith([[id1, data1]])
    const client = new DAOContractClient(
      contractInstance,
      new Map([
        [id1, metadata1],
        [id2, metadata2]
      ])
    )

    const servers = await client.getAllServers()

    expect(servers).toEqual(new Set([metadata1]))
  })

  it(`When there are no servers on the list, then an empty set is returned`, async () => {
    const [mock, contractInstance] = contractWith([])
    const client = new DAOContractClient(contractInstance)

    const servers = await client.getAllServers()

    expect(servers.size).toEqual(0)
    verify(mock.getCatalystIdByIndex(anyNumber())).never()
    verify(mock.getServerData(anyString())).never()
  })

  it(`When metadata is already known, then the contract isn't called`, async () => {
    const [mock, contractInstance] = contractWith([[id1, data1]])
    const client = new DAOContractClient(
      contractInstance,
      new Map([
        [id1, metadata1],
        [id2, metadata2]
      ])
    )

    await client.getAllServers()

    verify(mock.getServerData(id1)).never()
  })

  it(`When server's domain starts with http, then server is ignored`, async () => {
    const data = { id: id1, owner: 'owner', domain: 'http://domain.com' }
    const [, contractInstance] = contractWith([[id1, data]])
    const client = new DAOContractClient(contractInstance)

    const servers = await client.getAllServers()

    expect(servers.size).toEqual(0)
  })

  it(`When domain doesn't have protocol, then https is added`, async () => {
    const data = { id: id1, owner: 'owner', domain: 'domain.com' }
    const [, contractInstance] = contractWith([[id1, data]])
    const client = new DAOContractClient(contractInstance)

    const servers = await client.getAllServers()

    expect(servers.size).toEqual(1)
    const { id, owner, address } = servers.values().next().value
    expect(id).toEqual(id1)
    expect(owner).toEqual('owner')
    expect(address).toEqual('https://domain.com')
  })

  function contractWith(servers: [CatalystId, CatalystData][]): [DAOContract, DAOContract] {
    const mockedContract: DAOContract = mock(DAOContract)
    when(mockedContract.getCount()).thenReturn(Promise.resolve(servers.length))
    when(mockedContract.getCatalystIdByIndex(anyNumber())).thenCall((index) => Promise.resolve(servers[index][0]))
    when(mockedContract.getServerData(anyString())).thenCall((id) =>
      Promise.resolve(servers.find(([catalystId]) => catalystId === id)![1])
    )
    return [mockedContract, instance(mockedContract)]
  }
})
