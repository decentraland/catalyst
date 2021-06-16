import { Center } from 'decentraland-ui'
import React from 'react'
import ReactDOM from 'react-dom'
import { Peer } from '../peer/src/Peer'
import { Chat } from './components/Chat'
import { ConnectForm } from './components/ConnectForm'

type ScreenEnum = 'connect' | 'chat'

class App extends React.Component<unknown, { screen: ScreenEnum; peer?: Peer; room?: string; url?: string }> {
  constructor(props: unknown) {
    super(props)
    this.state = { screen: 'connect' }
  }

  currentScreen(): React.ReactElement {
    switch (this.state.screen) {
      case 'connect':
        return this.connectForm()
      case 'chat':
        if (this.state.peer && this.state.room) {
          return <Chat peer={this.state.peer} room={this.state.room} url={this.state.url!} />
        } else {
          return this.connectForm()
        }
    }
  }

  private connectForm(): React.ReactElement<
    any,
    | string
    | ((props: any) => React.ReactElement<any, string | any | (new (props: any) => React.Component<any, any, any>)>)
    | (new (props: any) => React.Component<any, any, any>)
  > {
    return (
      <ConnectForm
        onConnected={(peer, room, url) => {
          this.setState({ screen: 'chat', peer, room, url })
        }}
        peerClass={Peer}
      />
    )
  }

  render() {
    return (
      <div className="container">
        <Center>{this.currentScreen()}</Center>
      </div>
    )
  }
}

export default function renderApp() {
  ReactDOM.render(<App />, document.getElementById('root'))
}
