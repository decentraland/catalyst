import { useRoutes } from 'hookrouter'
import React, { useState } from 'react'
import { Comms } from '../comms/Comms'
import { Dashboard } from '../dashboard'
import { Profiles } from '../profiles/Profiles'
import { Scenes } from '../scenes/Scenes'
import { server } from '../server'
import './App.css'
import { Main } from './Main'
import { Sidebar } from './Sidebar'
import { Denylist } from '../denyList/Denylist'
import { DAOList } from './DAOList'
import { Header } from './Header'

const root = '/'
const comms = '/comms'
const denylist = '/denylist'
const scenes = '/scenes'
const profiles = '/profiles'
const dao = '/dao'

export const contentServer = `https://${server}/content/`

const routes = {
  [root]: () => <Dashboard />,
  [comms]: () => <Comms />,
  [scenes]: () => <Scenes />,
  [profiles]: () => <Profiles />,
  [denylist]: () => <Denylist />,
  [dao]: () => <DAOList />,
}

function App() {
  const [active, setActive] = useState('/' + window.location.pathname.split('/')[1])
  const RouteResult = useRoutes(routes)
  return (
    <div className="App">
      <Sidebar active={active} setActive={setActive} />
      <Main>
        <Header />
        <div className="content">{RouteResult}</div>
      </Main>
    </div>
  )
}

export default App
