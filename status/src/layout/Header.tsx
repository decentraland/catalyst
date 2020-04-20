import React from 'react';
import useSWR from 'swr';
import { commsServer } from '../comms/Comms';
import { fetchJSON } from '../components/fetchJSON';
import { server } from '../server';
export function Header() {
  const { data: comms } = useSWR(commsServer + 'status', fetchJSON);
  return (<div className="catalyst-header">
    {server}
    {comms && `: ${comms.name}`}
  </div>);
}
