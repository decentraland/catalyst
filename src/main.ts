import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
