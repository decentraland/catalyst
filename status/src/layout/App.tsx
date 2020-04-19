import { useRoutes } from "hookrouter";
import React, { useState } from "react";
import useSWR from "swr";
import { Comms, commsServer } from "../comms/Comms";
import { DisplayObject } from "../components/DisplayObject";
import { fetchJSON } from "../components/fetchJSON";
import { Dashboard } from "../dashboard";
import { server } from "../server";
import "./App.css";
import { Main } from "./Main";
import { Sidebar } from "./Sidebar";
import { DisplayError } from "../components/DisplayError";
import moment from "moment";

const root = "/";
const dao = "/dao";
const comms = "/comms";
const denylist = "/denylist";
const scenes = "/scenes";
const profiles = "/profiles";

const contentServer = `https://${server}/content/`;

function Position(props: { coordinate: string }) {
  return (
    <a target="_blank" rel="noopener noreferrer" href={`https://play.decentraland.org/?position=${props.coordinate}`}>
      {props.coordinate}
    </a>
  );
}
function LinkContent(props: { hash: string }) {
  return (
    <a target="_blank" rel="noopener noreferrer" href={`${contentServer}contents/${props.hash}`}>
      {props.hash}
    </a>
  );
}

function DisplayScene(props: { scene: any }) {
  const name = props.scene?.metadata?.display?.title || "Untitled scene";
  const length = props.scene?.pointers.length;
  return (
    <div>
      <p>
        <strong>{name}</strong> ({length} parcel{length === 1 ? "" : "s"}, base: <Position coordinate={props.scene?.metadata?.scene?.base} />)
        <br/>
        Deployed {moment(props.scene.timestamp).fromNow()} <br/>id: <LinkContent hash={props.scene.id} /> 
      </p>
    </div>
  );
}

function SceneGrid(props: { scenes: string[] }) {
  const { data, error } = useSWR(contentServer + "entities/scenes?id=" + props.scenes.join("&id="), fetchJSON);
  return (
    <div>
      <h3>Last Submitted Scenes</h3>
      {data && data.map((_: any) => <DisplayScene scene={_} />)}
      {error && <DisplayError error={error} />}
    </div>
  );
}

function Scenes() {
  const { data, error } = useSWR(contentServer + "history", fetchJSON);
  return (
    <div>
      {data && (
        <SceneGrid
          scenes={data.events
            .filter((_: any) => _.entityType === "scene")
            .slice(0, 10)
            .map((_: any) => _.entityId)}
        />
      )}
    </div>
  );
}

const routes = {
  [root]: () => <Dashboard />,
  [comms]: () => <Comms />,
  [scenes]: () => <Scenes />,
  [profiles]: () => <h1>profiles</h1>,
  [dao]: () => <h3>DAO</h3>,
  [denylist]: () => <h1>denylist</h1>,
};

function Header() {
  const { data: comms, error: error1 } = useSWR(commsServer + "status", fetchJSON);
  return (
    <div className="catalyst-header">
      {server}
      {comms && `: ${comms.name}`}
    </div>
  );
}

function App() {
  const [active, setActive] = useState("/" + window.location.pathname.split("/")[1]);
  const RouteResult = useRoutes(routes);
  return (
    <div className="App">
      <Sidebar active={active} setActive={setActive} />
      <Main>
        <Header />
        <div className="content">{RouteResult}</div>
      </Main>
    </div>
  );
}

export default App;
