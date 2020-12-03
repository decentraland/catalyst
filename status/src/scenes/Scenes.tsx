import React from 'react'
import useSWR from 'swr'
import { fetchJSON } from '../components/fetchJSON'
import { ServerAware } from '../layout/ServerAware'
import { SceneGrid } from './SceneGrid'
import { buildContentServerUrl } from '../buildServerUrl'

export function Scenes(props: ServerAware) {
  const { server } = props
  const contentServer = buildContentServerUrl(server)
  const { data } = useSWR(contentServer + 'history', fetchJSON)
  return (
    <div>
      {data && (
        <SceneGrid
          {...props}
          scenes={data.events
            .filter((_: any) => _.entityType === 'scene')
            .slice(0, 10)
            .map((_: any) => _.entityId)}
        />
      )}
    </div>
  )
}
