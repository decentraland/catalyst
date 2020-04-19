import React from "react";
import useSWR from "swr";
import { fetchJSON } from "../components/fetchJSON";
import { server, addressFilter } from "./Comms";
import { User } from "../profiles/User";
export function LayerInfo(props: {
  name: string;
  serverName: string;
  layerName: string;
  usersCount: number;
  maxUsers: number;
}) {
  const { data } = useSWR(server + "layers/" + props.name + "/rooms", fetchJSON);
  const users = data && data.filter(addressFilter);
  return (<div>
    <h4>
      Layer {props.name} ({props.usersCount} / {props.maxUsers})
      </h4>
    {users && users.map((user: string) => <User key={user} address={user} serverName={props.serverName} layer={props.name} />)}
  </div>);
}
