/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Button, Field } from 'decentraland-ui'
import React, { useEffect, useState } from 'react'
import { discretizedPositionDistanceXZ } from '../../../commons/utils/Positions'
import { Peer } from '../../peer/src'
import { util } from '../../peer/src/peerjs-server-connector/util'
import { mouse } from './Mouse'
import { PeerToken } from './PeerToken'

function fieldFor(label: string, value: string, setter: (s: string) => any) {
  return <Field label={label} onChange={(ev) => setter(ev.target.value)} value={value} />
}

declare const window: Window & { peer: Peer }

export function ConnectForm(props: {
  onConnected: (peer: Peer, room: string, url: string) => any
  peerClass: {
    new (url: string, peerId: string, callback: any, config: any): Peer
  }
}) {
  const [nickname, setNickname] = useState('')
  const [room, setRoom] = useState('')
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const searchParams = new URLSearchParams(window.location.search)
  const [url, setUrl] = useState(searchParams.get('lighthouseUrl') ?? 'http://localhost:9000')

  const queryRoom = searchParams.get('room')
  const queryNickname = searchParams.get('nickname')

  async function joinRoom(aRoom = room, aNickname = nickname) {
    setError('')
    setLoading(true)
    try {
      //@ts-ignore
      const peer = (window.peer = new props.peerClass(url, undefined, () => {}, {
        token: PeerToken.getToken(aNickname),
        positionConfig: {
          selfPosition: () => [mouse.x, mouse.y, 0],
          maxConnectionDistance: 3,
          distance: discretizedPositionDistanceXZ([100, 200, 400, 600, 800]),
          nearbyPeersDistance: 10,
          disconnectDistance: 5
        },
        targetConnections: 2,
        logLevel: 'DEBUG',
        maxConnections: 6,
        pingTimeout: 10000,
        pingInterval: 5000,
        optimizeNetworkInterval: 10000,
        relaySuspensionConfig: {
          relaySuspensionInterval: 750,
          relaySuspensionDuration: 5000
        },
        connectionConfig: {
          iceServers: [
            {
              urls: 'stun:stun.l.google.com:19302'
            },
            {
              urls: 'stun:stun2.l.google.com:19302'
            },
            {
              urls: 'stun:stun3.l.google.com:19302'
            },
            {
              urls: 'stun:stun4.l.google.com:19302'
            }
          ]
        },
        authHandler: (msg) => Promise.resolve(msg)
      }))
      await peer.awaitConnectionEstablished()
      await peer.joinRoom(aRoom)
      setLoading(false)
      props.onConnected(peer, aRoom, url)
    } catch (e) {
      setError(e.message ?? e.toString())
      console.log(e)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (searchParams.get('join')) {
      const aRoom = queryRoom ?? 'room'
      const aNickname = queryNickname ?? 'peer-' + util.randomToken()
      setRoom(queryRoom ?? 'room')
      setNickname(queryNickname ?? 'peer-' + util.randomToken())

      joinRoom(aRoom, aNickname)
    }
  }, [])

  return (
    <div className="connect-form">
      {fieldFor('URL', url, setUrl)}
      {fieldFor('Nickname', nickname, setNickname)}
      {fieldFor('Room', room, setRoom)}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <Button
        primary
        disabled={[url, nickname, room].some((it) => it === '') || isLoading}
        onClick={() => joinRoom()}
        loading={isLoading}
      >
        Connect
      </Button>
    </div>
  )
}
