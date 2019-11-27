// currently third part packages frmo npm are not available due to issue:
import React from "react";
import ReactDOM from "react-dom";

import Peer from 'peerjs';

const peer = new Peer(new Date().getTime().toString()); 

const conn = peer.connect('another-peers-id');

conn.on('open', () => {
  conn.send('hi!');
});

class App extends React.Component {
  constructor(props: {}) {
    super(props);
  }

  render() {
    return (
      <div>
        <p>Hello World!!</p>
      </div>
    );
  }
}

export default function renderApp() {
    ReactDOM.render(<App />, document.getElementById("root"));
}