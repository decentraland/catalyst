import React from 'react'
import useSWR from 'swr'
import { fetchJSON } from '../components/fetchJSON'
import { ServerAware } from './ServerAware'
export function Header(props: ServerAware) {
  const { server } = props
  const commsServer = `https://${server}/comms/`
  const { data: comms } = useSWR(commsServer + 'status', fetchJSON)
  return (
    <div className="catalyst-header">
      {server}
      {comms && `: ${comms.name}`}
    </div>
  )
}
