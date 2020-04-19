import React from "react";
import useSWR from "swr";
import { fetchJSON } from "../components/fetchJSON";
import { Loading } from "../components/Loading";
import { Avatar } from "./Avatar";
import { server } from "../comms/Comms";
export function User(props: {
  address: string;
  layer: string;
  serverName: string;
}) {
  const { data } = useSWR(server + "layers/" + props.layer + "/rooms/" + props.address, fetchJSON);
  const { data: userInfo } = useSWR(server.replace("comms", "content") + "entities/profile?pointer=" + props.address, fetchJSON);
  const contentServer = server.replace("comms", "content");
  if (!data || !data.length) {
    return <Loading />;
  }
  const peer = data[0];
  return (<div>
    <Avatar address={props.address} userInfo={userInfo} contentServer={contentServer} position={peer.parcel} layer={props.layer} serverName={props.serverName} />
  </div>);
}
