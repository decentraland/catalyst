import React from "react";
import useSWR from "swr";
import { fetchJSON } from "../components/fetchJSON";
import { addressFilter } from "./Comms";
import { User } from "../profiles/User";
import { server } from "../server";

const commsServer = "https://" + server + "/comms/";

export function LayerInfo(props: { name: string; serverName: string; layerName: string; usersCount: number; maxUsers: number }) {
  const { data } = useSWR(commsServer + "layers/" + props.name + "/rooms", fetchJSON);
  const users = data && data.filter(addressFilter);
  return (
    <div>
      <h4>
        <strong>{props.name}:</strong> {props.usersCount} user{props.usersCount === 1 ? '' : 's'}
      </h4>
      {users && users.map((user: string) => <User key={user} address={user} serverName={props.serverName} layer={props.name} />)}
    </div>
  );
}
