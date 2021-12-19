import { Lifecycle } from '@well-known-components/interfaces'
import { EnvironmentBuilder } from '../Environment'
import { main } from '../service'
import { AppComponents } from '../types'

async function initComponents(): Promise<AppComponents> {
  return await new EnvironmentBuilder().buildConfigAndComponents()
}

// This file is the program entry point, it only calls the Lifecycle function
Lifecycle.run({ main, initComponents })
