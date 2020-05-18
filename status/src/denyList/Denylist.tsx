import { Authenticator, AuthIdentity, IdentityType } from 'dcl-crypto'
import React, { useCallback, useState } from 'react'
import useSWR from 'swr'
import Web3 from 'web3'
import { Account } from 'web3x/account'
import { Address } from 'web3x/address'
import { Eth } from 'web3x/eth'
import { create, fromPrivate } from 'web3x/eth-lib/account'
import { bufferToHex } from 'web3x/utils'
import { buildContentServerUrl } from '../buildServerUrl'
import { fetchJSON } from '../components/fetchJSON'
import { catalysts } from '../contracts/offline'
import { ServerAware } from '../layout/ServerAware'
import { onConnect } from '../web3/onConnect'

export function getFromStorage(key: string): any {
  let raw = window.localStorage.getItem(key)
  if (!raw) {
    return null
  }
  return JSON.parse(raw)
}
export function saveToStorage(key: string, value: any): any {
  return window.localStorage.setItem(key, JSON.stringify(value))
}

function getEphemeralIdentity(): IdentityType {
  let privateKey = window.localStorage.getItem('dcl-crypto-ephemeral')
  let account
  if (!privateKey) {
    const buffer = new Buffer(32)
    const result = window.crypto.getRandomValues(buffer)
    account = create(result)
    window.localStorage.setItem('dcl-crypto-ephemeral', account.privateKey.toString('hex'))
  } else {
    account = fromPrivate(Buffer.from(privateKey, 'hex'))
  }
  return {
    address: account.address,
    privateKey: account.privateKey.toString('hex'),
    publicKey: account.publicKey.toString('hex'),
  }
}

async function getSignatureChain(provider: any, ephemeral: IdentityType) {
  const eth = Eth.fromCurrentProvider()!
  const addresses = await eth.getAccounts()
  const address = addresses[0]
  const chain = getFromStorage('dcl-crypto-chain-' + address)
  if (!chain || new Date(chain.expiration).getTime() < new Date().getTime()) {
    const account = Account.create()

    const payload = {
      address: account.address.toString(),
      publicKey: bufferToHex(account.publicKey),
      privateKey: bufferToHex(account.privateKey),
    }

    const ONE_MONTH_MILLISECONDS = 31 * 24 * 60 * 60 * 1000
    const expiration = Number(ONE_MONTH_MILLISECONDS)

    const identity = await Authenticator.initializeAuthChain(address.toString(), payload, expiration, (message) =>
      new Web3(provider).eth.personal.sign(message, address.toString(), '')
    )
    saveToStorage('dcl-crypto-chain-' + address, identity)
    return identity
  } else {
    return chain
  }
}

async function getIdentity(provider: any) {
  const ephemeralIdentity: IdentityType = getEphemeralIdentity()
  return getSignatureChain(provider, ephemeralIdentity)
}

export function denyBy(type: string, provider: any, identity: AuthIdentity, contentServer: string) {
  return (ev: any) => {
    const data = (document.getElementById('deny-' + type) as any).value
    const timestamp = new Date().getTime()
    const payload = `${type}-${data}` + timestamp
    const address = provider.selectedAddress
    new Web3(provider).eth.personal.sign(payload, address, '').then((signature) => {
      fetch(`${contentServer}denylist/${type}/${data}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          blocker: Address.fromString(address).toString(),
          timestamp,
          signature,
        }),
      })
        .then((result) => {
          console.log(result, timestamp, signature)
        })
        .catch((_) => {
          console.log(_)
        })
    })
    ev.preventDefault()
    return false
  }
}

export function Denylist(props: ServerAware) {
  const { server } = props
  const contentServer = buildContentServerUrl(server)
  const { data } = useSWR(contentServer + 'denylist', fetchJSON)
  const [provider, setProvider]: any = useState(null)
  const [identity, setIdentity]: any = useState(null)
  const connect = useCallback((ev: any) => {
    onConnect().then(async (providerConnect) => {
      setProvider(providerConnect)
      setIdentity(await getIdentity(providerConnect))
    })
    ev.preventDefault()
    return false
  }, [])
  const catalystOwner = catalysts.filter((_: any) => _.domain === server)[0].owner.toString()
  return (
    <div>
      <h3>Denylist Management</h3>
      <h4>Catalyst Owner: {catalystOwner}</h4>
      <h4>Current Deny List</h4>
      {data && data.length ? (
        <ul>
          {data
            .map((_: any) => _.target)
            .map((_: any) => (
              <li>
                {_.type}: {_.id}
              </li>
            ))}
        </ul>
      ) : (
          <h5>Empty</h5>
        )}
      {provider ? (
        provider.selectedAddress.toLowerCase() === catalystOwner.toLowerCase() ? (
          <>
            <h5>Deny by deployer address</h5>
            <form onSubmit={denyBy('address', provider, identity, contentServer)}>
              <input className="input-denylist" name="address" id="deny-address"></input>
              <button type="submit">Submit</button>
            </form>
            <h5>Deny by content hash</h5>
            <form onSubmit={denyBy('content', provider, identity, contentServer)}>
              <input className="input-denylist" name="content" id="deny-content"></input>
              <button type="submit">Submit</button>
            </form>
            <h5>Deny by entity id</h5>
            <form onSubmit={denyBy('entity', provider, identity, contentServer)}>
              <input className="input-denylist" name="entity" id="deny-entity"></input>
              <button type="submit">Submit</button>
            </form>
            <h5>Deny by parcel coordinate</h5>
            <form onSubmit={denyBy('pointer', provider, identity, contentServer)}>
              <input className="input-denylist" name="pointer" id="deny-pointer"></input>
              <button type="submit">Submit</button>
            </form>
          </>
        ) : (
            <>
              <h4>Log in as the catalyst owner to access the denylist</h4>
              <h5>The current address is {provider.selectedAddress}</h5>
            </>
          )
      ) : (
          <>
            <h4>Login to manage the denylists</h4>
            <form onSubmit={connect}>
              <button type="submit">Connect</button>
            </form>
          </>
        )}
    </div>
  )
}
