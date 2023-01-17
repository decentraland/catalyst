import { Lifecycle } from '@well-known-components/interfaces'
import { AppComponents } from '../../src/types'
import { EnvironmentBuilder } from '../Environment'
import { main } from '../service'

// This file is the program entry point, it only calls the Lifecycle function
void Lifecycle.run<AppComponents>({
  main,
  initComponents() {
    return new EnvironmentBuilder().buildConfigAndComponents()
  }
})
