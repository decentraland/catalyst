import React from 'react'
import useSWR from 'swr'
import { buildCommsServerUrl, buildContentServerUrl, buildLambdasServerUrl } from '../buildServerUrl'
import { DisplayError } from '../components/DisplayError'
import { DisplayObject } from '../components/DisplayObject'
import { fetchJSON } from '../components/fetchJSON'
import { ServerAware } from '../layout/ServerAware'

export function Dashboard(props: ServerAware) {
  const { server } = props
  const contentServer = buildContentServerUrl(server)
  const commsServer = buildCommsServerUrl(server)
  const lambdaServer = buildLambdasServerUrl(server)
  const { data, error } = useSWR(contentServer + '/status', fetchJSON)
  const { data: commsData, error: error2 } = useSWR(commsServer + '/status', fetchJSON)
  const { data: lambdaData, error: error3 } = useSWR(lambdaServer + '/status', fetchJSON)
  return (
    <div>
      <h2>Server status</h2>
      <h3>Content</h3>
      {data && <DisplayObject object={data} />}
      <h3>Comms</h3>
      {commsData && <DisplayObject object={commsData} />}
      <h3>Lambdas</h3>
      {lambdaData && <DisplayObject object={lambdaData} />}
      {error && <DisplayError error={error} />}
      {error2 && <DisplayError error={error2} />}
      {error3 && <DisplayError error={error3} />}
    </div>
  )
}
