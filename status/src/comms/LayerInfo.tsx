import React from 'react'
import useSWR from 'swr'
import { fetchJSON } from '../components/fetchJSON'
import { ServerAware } from '../layout/ServerAware'
import { User } from '../profiles/User'
import { addressFilter } from './Comms'

export function LayerInfo(
  props: { name: string; serverName: string; layerName: string; usersCount: number; maxUsers: number } & ServerAware
) {
  const { server } = props
  const commsServer = 'https://' + server + '/comms/'
  const { data } = useSWR(commsServer + 'layers/' + props.name + '/rooms', fetchJSON)
  const users = data && data.filter(addressFilter)
  return (
    <div>
      <h4>
        <strong>{props.name}:</strong> {props.usersCount} user{props.usersCount === 1 ? '' : 's'}
      </h4>
      {users &&
        users.map((user: string) => (
          <User key={user} address={user} serverName={props.serverName} layer={props.name} {...props} />
        ))}
    </div>
  )
}
