import React from 'react'
import useSWR from 'swr'
import { DisplayError } from '../components/DisplayError'
import { fetchJSON } from '../components/fetchJSON'
import { ServerAware } from '../layout/ServerAware'
import { DisplayScene } from './ScenesList'
import { buildContentServerUrl } from '../buildServerUrl'

export function SceneGrid(props: { scenes: string[] } & ServerAware) {
  const { server } = props
  const contentServer = buildContentServerUrl(server)
  const { data, error } = useSWR(contentServer + 'entities/scenes?id=' + props.scenes.join('&id='), fetchJSON)
  return (
    <div>
      <h3>Last Submitted Scenes</h3>
      {data && data.map((_: any) => <DisplayScene key={_.id} scene={_} {...props} />)}
      {error && <DisplayError error={error} />}
    </div>
  )
}
