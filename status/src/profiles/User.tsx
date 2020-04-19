import React from "react";
import useSWR from "swr";
import { fetchJSON } from "../components/fetchJSON";
import { Loading } from "../components/Loading";
import { server } from "../server";
import { Avatar } from "./Avatar";

const commsServer = "https://" + server + "/comms/";
const contentServer = "https://" + server + "/content/";

export function User(props: { address: string; layer: string; serverName: string }) {
  const { data } = useSWR(commsServer + "layers/" + props.layer + "/rooms/" + props.address, fetchJSON);
  const { data: userInfo } = useSWR(contentServer + "entities/profile?pointer=" + props.address, fetchJSON);
  if (!data || !data.length) {
    return <Loading />;
  }
  const peer = data[0];
  return (
    <div>
      <Avatar address={props.address} userInfo={userInfo} contentServer={contentServer} position={peer.parcel} layer={props.layer} serverName={props.serverName} />
    </div>
  );
}
