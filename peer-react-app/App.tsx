// currently third part packages frmo npm are not available due to issue:
import React from "react";
import ReactDOM from "react-dom";
import { Center } from "decentraland-ui";
import { ConnectForm } from "./components/ConnectForm";
import { Peer } from "../peer/src/Peer";
import { IPeer } from "../peer/src/types";
import { Chat } from "./components/Chat";

type ScreenEnum = "connect" | "chat";

class App extends React.Component<
  {},
  { screen: ScreenEnum; peer?: IPeer; room?: string; url?: string }
> {
  constructor(props: {}) {
    super(props);
    this.state = { screen: "connect" };
  }

  currentScreen(): React.ReactElement {
    // const peer = {
    //   nickname: "miguel",
    //   currentRooms: [
    //     {
    //       id: "coolkids",
    //       users: new Map([
    //         ["0", { userId: "miguel", peerId: "miguel" }],
    //         ["1", { userId: "boris", peerId: "miguel" }]
    //       ])
    //     },
    //     {
    //       id: "family",
    //       users: new Map([
    //         ["0", { userId: "pablitar", peerId: "pablitar" }],
    //         ["1", { userId: "marcosnc", peerId: "remote" }],
    //         ["2", { userId: "nchamo", peerId: "remote" }]
    //       ])
    //     }
    //   ],
    //   callback: () => {},
    //   joinRoom: (room: string) => Promise.resolve(),
    //   leaveRoom: (roomId: string) => Promise.resolve(),
    //   sendMessage: (room: string, payload: any, reliable?: boolean) =>
    //     Promise.resolve()
    // };
    // const room = "coolkids";
    // const url = "http://localhost:9000"
    // return <Chat peer={peer} room={room} url={url} />;
    switch (this.state.screen) {
      case "connect":
        return this.connectForm();
      case "chat":
        if (this.state.peer && this.state.room) {
          return (
            <Chat
              peer={this.state.peer}
              room={this.state.room}
              url={this.state.url!}
            />
          );
        } else {
          return this.connectForm();
        }
    }
  }

  // @ts-ignore
  private connectForm(): React.ReactElement<
    any,
    | string
    | ((
        props: any
      ) => React.ReactElement<
        any,
        string | any | (new (props: any) => React.Component<any, any, any>)
      >)
    | (new (props: any) => React.Component<any, any, any>)
  > {
    return (
      <ConnectForm
        onConnected={(peer, room, url) => {
          this.setState({ screen: "chat", peer, room, url });
        }}
        peerClass={Peer}
      />
    );
  }

  render() {
    return (
      <div className="container">
        <Center>{this.currentScreen()}</Center>
      </div>
    );
  }
}

export default function renderApp() {
  ReactDOM.render(<App />, document.getElementById("root"));
}
