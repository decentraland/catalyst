import React from 'react';
import { catalysts } from '../contracts/offline';
export function DAOList() {
  return (<div>
    <h3>DAO Servers</h3>
    <ul>
      {catalysts.map((_) => {
        return <li key={_.domain}>
          <strong>{_.domain}</strong> (by {_.owner})
          </li>;
      })}
    </ul>
  </div>);
}
