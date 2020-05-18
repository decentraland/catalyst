import { useRoutes } from 'hookrouter'
import React, { useState } from 'react'
import { Comms } from '../comms/Comms'
import { Dashboard } from '../dashboard'
import { Denylist } from '../denyList/Denylist'
import { Profiles } from '../profiles/Profiles'
import { Scenes } from '../scenes/Scenes'
import './App.css'
import { DAOList } from './DAOList'
import { Header } from './Header'
import { Main } from './Main'
import { ServerAware } from './ServerAware'
import { Sidebar } from './Sidebar'

const root = '/'
const comms = '/comms'
const denylist = '/denylist'
const scenes = '/scenes'
const profiles = '/profiles'
const dao = '/dao'

const routes = (props: ServerAware) => ({
  [root]: () => <Dashboard {...props} />,
  [comms]: () => <Comms {...props} />,
  [scenes]: () => <Scenes {...props} />,
  [profiles]: () => <Profiles {...props} />,
  [denylist]: () => <Denylist {...props} />,
  [dao]: () => <DAOList {...props} />,
})

function App() {
  const [active, setActive] = useState('/' + window.location.pathname.split('/')[1])
  const [server, setServer] = useState('peer.decentraland.org')
  const RouteResult = useRoutes(routes({ server, setServer }))
  return (
    <div className="App">
      <Sidebar active={active} setActive={setActive} server={server} setServer={setServer} />
      <Main>
        <Header server={server} setServer={setServer} />
        <div className="content">{RouteResult}</div>
      </Main>
    </div>
  )
}

export default App
