import React from 'react'
import useSWR from 'swr'
import { buildCommsServerUrl } from '../buildServerUrl'
import { fetchJSON } from '../components/fetchJSON'
import { catalysts } from '../contracts/offline'
import { ServerAware } from './ServerAware'

export function Header(props: ServerAware) {
  const { server, setServer } = props
  const commsServer = buildCommsServerUrl(server)
  const { data: comms } = useSWR(commsServer + 'status', fetchJSON)
  return (
    <div className="catalyst-header">
      <select onChange={(ev: any) => setServer(ev.target.value)}>
        {catalysts.map((_) => (
          <option selected={_.domain === server} value={_.domain} key={_.domain}>
            {_.domain}
          </option>
        ))}
      </select>
      {comms && `: ${comms.name}`}
    </div>
  )
}
