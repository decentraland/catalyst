import React from 'react'
import { ServerAware } from '../layout/ServerAware'

export function LinkContent(props: { hash: string } & ServerAware) {
  const { server } = props
  const contentServer = 'https://' + server + '/content/'
  return (
    <a target="_blank" rel="noopener noreferrer" href={`${contentServer}contents/${props.hash}`}>
      {props.hash}
    </a>
  )
}
