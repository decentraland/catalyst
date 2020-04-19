import React from "react";
import useSWR from "swr";
import { DisplayObject } from "../components/DisplayObject";
import { fetchJSON } from "../components/fetchJSON";
import { catalysts } from "../contracts/offline";
import { server } from "../server";
import { contentServer } from "../layout/App";
export function Denylist() {
  const { data } = useSWR(contentServer + "denylist", fetchJSON);
  return (<div>
    <h3>Denylist Management</h3>
    <h4>Catalyst Owner: {catalysts.filter((_: any) => _.domain === server)[0].owner.toString()}</h4> <h4></h4>
    <h4>Current Deny List</h4>
    {data && data.length ? <DisplayObject object={data} /> : <h5>Empty</h5>}
    <h5>Deny by deployer address</h5>
    <div>
      <input className="input-denylist"></input>
    </div>
    <h5>Deny by content id</h5>
    <div>
      <input className="input-denylist"></input>
    </div>
    <h5>Deny by parcel coordinate</h5>
    <div>
      <input className="input-denylist"></input>
    </div>
  </div>);
}
