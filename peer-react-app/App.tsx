// currently third part packages frmo npm are not available due to issue:
import React from "react";
import ReactDOM from "react-dom";
import { Center, Page } from "decentraland-ui";
import { ConnectForm } from "./components/ConnectForm";
// @ts-ignore
import { IPeer , Peer} from "../peer/Peer";
// @ts-ignore
import { PeerStub } from '../peer/PeerStub';
import { Chat } from "./components/Chat";

type ScreenEnum = "connect" | "chat";

class App extends React.Component<{}, { screen: ScreenEnum; peer?: IPeer }> {
  constructor(props: {}) {
    super(props);
    this.state = { screen: "connect" };
  }

  currentScreen(): React.ReactElement {
    switch (this.state.screen) {
      case "connect":
        return (
          this.connectForm()
        );
      case "chat":
        if(this.state.peer){
          return <Chat peer={this.state.peer} />;
        } else {
          return this.connectForm();
        }
    }
  }

  private connectForm(): React.ReactElement<any, string | ((props: any) => React.ReactElement<any, string | any | (new (props: any) => React.Component<any, any, any>)>) | (new (props: any) => React.Component<any, any, any>)> {
    return <ConnectForm onConnected={peer => {
      this.setState({ screen: "chat", peer });
    } } peerClass={PeerStub} />;
  }

  render() {
    return (
      <div className="container">
        <Page>
          <Center>{this.currentScreen()}</Center>
        </Page>
      </div>
    );
  }
}

export default function renderApp() {
  ReactDOM.render(<App />, document.getElementById("root"));
}
