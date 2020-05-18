import React from 'react'
import useSWR from 'swr'
import { fetchJSON } from '../components/fetchJSON'
import { ServerAware } from '../layout/ServerAware'
import { ProfilesGrid } from './ProfilesGrid'

export function Profiles(props: ServerAware) {
  const { server } = props
  const contentServer = 'https://' + server + '/content/'
  const { data } = useSWR(contentServer + 'history', fetchJSON)
  return (
    <div>
      {data && (
        <ProfilesGrid
          {...props}
          profiles={data.events
            .filter((_: any) => _.entityType === 'profile')
            .slice(0, 10)
            .map((_: any) => _.entityId)}
        />
      )}
    </div>
  )
}
