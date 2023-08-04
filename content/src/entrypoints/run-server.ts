import { Lifecycle } from '@well-known-components/interfaces'
import { AppComponents } from '../types.js'
import { EnvironmentBuilder } from '../Environment.js'
import { main } from '../service.js'

// This file is the program entry point, it only calls the Lifecycle function
void Lifecycle.run<AppComponents>({
  main,
  initComponents() {
    return new EnvironmentBuilder().buildConfigAndComponents()
  }
})
