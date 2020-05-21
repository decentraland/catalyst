import React from 'react'
import { ServerAware } from '../layout/ServerAware'
import { buildContentServerUrl } from '../buildServerUrl'

export function LinkContent(props: { hash: string } & ServerAware) {
  const { server } = props
  const contentServer = buildContentServerUrl(server)
  return (
    <a target="_blank" rel="noopener noreferrer" href={`${contentServer}contents/${props.hash}`}>
      {props.hash}
    </a>
  )
}
