import { useRoutes } from "hookrouter";
import React, { useState } from "react";
import useSWR from "swr";
import { Comms, commsServer } from "../comms/Comms";
import { fetchJSON } from "../components/fetchJSON";
import { Dashboard } from "../dashboard";
import { Profiles } from "../profiles/Profiles";
import { Scenes } from "../scenes/Scenes";
import { server } from "../server";
import "./App.css";
import { Main } from "./Main";
import { Sidebar } from "./Sidebar";

const root = "/";
const dao = "/dao";
const comms = "/comms";
const denylist = "/denylist";
const scenes = "/scenes";
const profiles = "/profiles";

export const contentServer = `https://${server}/content/`;

const routes = {
  [root]: () => <Dashboard />,
  [comms]: () => <Comms />,
  [scenes]: () => <Scenes />,
  [profiles]: () => <Profiles />,
  [dao]: () => <h3>DAO</h3>,
  [denylist]: () => <h1>denylist</h1>,
};

function Header() {
  const { data: comms } = useSWR(commsServer + "status", fetchJSON);
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
