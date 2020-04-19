import { useRoutes } from "hookrouter";
import React, { useState } from "react";
import "./App.css";
import { Sidebar } from "./Sidebar";

function Main(props: { children?: any }) {
  return <div className="main">{props.children}</div>;
}

const root = "/";
const dao = "/dao";
const comms = "/comms";
const denylist = "/denylist";
const scenes = "/scenes";
const profiles = "/profiles";

const routes = {
  [root]: () => <h1>Main</h1>,
  [dao]: () => <h2>DAO</h2>,
  [comms]: () => <h1>comms</h1>,
  [denylist]: () => <h1>denylist</h1>,
  [scenes]: () => <h1>scenes</h1>,
  [profiles]: () => <h1>profiles</h1>,
};

function App() {
  const [active, setActive] = useState('/' + window.location.pathname.split("/")[1]);
  const RouteResult = useRoutes(routes);
  return (
    <div className="App">
      <Sidebar active={active} setActive={setActive} />
      <Main>{RouteResult}</Main>
    </div>
  );
}

export default App;
