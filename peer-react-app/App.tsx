// currently third part packages frmo npm are not available due to issue:
import React from "react";
import ReactDOM from "react-dom";
import { Center, Page } from "decentraland-ui";
import { ConnectForm } from "./components/ConnectForm";
// import { connect } from "comms/peer";

// connect();

class App extends React.Component {
  constructor(props: {}) {
    super(props);
  }

  render() {
    return (
      <div className="container">
        <Page>
          <Center>
            <ConnectForm />
          </Center>
        </Page>
      </div>
    );
  }
}

export default function renderApp() {
  ReactDOM.render(<App />, document.getElementById("root"));
}
