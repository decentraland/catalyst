import React from 'react'

export function DisplayError(props: { error: any }) {
  const error = props.error
  return error ? (
    <div>
      <h2>Error!</h2>
      <pre>
        {error.message}: <br />
        {error.stack}
      </pre>
    </div>
  ) : (
    <div />
  )
}
