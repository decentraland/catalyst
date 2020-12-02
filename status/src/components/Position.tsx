import React from 'react'
export function Position(props: { coordinate: string }) {
  return (
    <a target="_blank" rel="noopener noreferrer" href={`https://play.decentraland.org/?position=${props.coordinate}`}>
      {props.coordinate}
    </a>
  )
}
