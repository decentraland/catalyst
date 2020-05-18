import React from 'react'
import { catalysts } from '../contracts/offline'
import { ServerAware } from './ServerAware'
export function DAOList(props: ServerAware) {
  const { setServer } = props
  return (
    <div>
      <h3>DAO Servers</h3>
      <ul>
        {catalysts.map((_) => {
          return (
            <li key={_.domain} style={{ fontWeight: _.domain === props.server ? 'bold' : 'normal' }}>
              <strong>{_.domain}</strong>{' '}
              <button
                onClick={() => setServer(_.domain)}
                style={{ display: _.domain === props.server ? 'none' : 'inline-block' }}
              >
                Set Active
              </button>{' '}
              (by {_.owner})
            </li>
          )
        })}
      </ul>
    </div>
  )
}
