import moment from 'moment'
import React from 'react'
import { buildContentServerUrl } from '../buildServerUrl'
import { shortenAddress } from '../comms/Comms'
import { ServerAware } from '../layout/ServerAware'

export function Profile(props: { profile: any } & ServerAware) {
  const { server } = props
  const contentServer = buildContentServerUrl(server)
  const data = props.profile.metadata.avatars[0]
  return (
    <div>
      <img width={50} alt="User avatar" src={contentServer + 'contents/' + data.avatar.snapshots.face} />
      <strong>{data.name || shortenAddress(props.profile.id)}</strong>: updated{' '}
      {moment(props.profile.timestamp).fromNow()} <br />
    </div>
  )
}
