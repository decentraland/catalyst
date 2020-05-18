import React from 'react'
import useSWR from 'swr'
import { DisplayError } from '../components/DisplayError'
import { fetchJSON } from '../components/fetchJSON'
import { ServerAware } from '../layout/ServerAware'
import { Profile } from './Profile'
import { buildContentServerUrl } from '../buildServerUrl'

export function ProfilesGrid(
  props: {
    profiles: string[]
  } & ServerAware
) {
  const { server } = props
  const contentServer = buildContentServerUrl(server)
  const { data, error } = useSWR(contentServer + 'entities/profiles?id=' + props.profiles.join('&id='), fetchJSON)
  return (
    <div>
      <h3>Last Submitted Profiles</h3>
      {data && data.map((_: any) => <Profile key={_.id} profile={_} {...props} />)}
      {error && <DisplayError error={error} />}
    </div>
  )
}
