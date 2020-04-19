import React from "react";
import useSWR from "swr";
import { DisplayError } from "../components/DisplayError";
import { fetchJSON } from "../components/fetchJSON";
import { Loading } from "../components/Loading";
import { LayerInfo } from "./LayerInfo";

export const addressFilter = (_: string) => _.startsWith("0x");

export const shortenAddress = (address: string) => [address.substr(0, 6), address.substr(-4)].join("...");

export const server = "https://peer.decentraland.org/comms/";

export function Comms(props: { name: string; url: string }) {
  const { data, error } = useSWR(server + "layers", fetchJSON);
  const layers = data ? data.filter((_: any) => _.usersCount > 0) : [];
  if (!layers) {
    return <Loading />;
  }
  return (
    <div>
      <h3>Comms</h3>
      <h4>
        {server}
        <br />({layers.length} layer{layers.length !== 1 ? "s" : ""} with users)
      </h4>
      {layers.map((_: any) => (
        <LayerInfo {..._} key={_.name} serverName={props.name} layerName={_.name} />
      ))}
      <DisplayError error={error} />
    </div>
  );
}
