import { runClients } from './test-client'
import { Browser } from 'puppeteer'

function requireParams(...names: string[]) {
  const missingValues = names.filter((it) => !process.env[it])

  if (missingValues.length > 0) {
    console.log('Missing values for environment variables: ' + missingValues.join(', '))
    console.log('Please provide values for them. Exiting...')

    process.exit(1)
  }
}

requireParams('TEST_ID', 'RESULTS_SERVER_URL', 'LIGHTHOUSE_URL', 'CLIENT_URL')

const testId = process.env.TEST_ID
const resultsServerUrl = process.env.RESULTS_SERVER_URL
const clientUrl = process.env.CLIENT_URL
const lighthouseUrl = process.env.LIGHTHOUSE_URL
const peersCount = parseInt(process.env.PEERS_COUNT ?? '10')
const testDuration = parseInt(process.env.TEST_DURATION ?? '180')
const idLength = parseInt(process.env.PEER_ID_LENGTH ?? '42')

;(async function () {
  let browsers: Browser[] = []
  try {
    browsers = await runClients(peersCount, testId!, idLength, lighthouseUrl, resultsServerUrl, clientUrl, testDuration)

    console.log('All browsers finished. Killing the process.')

    process.exit(0)
  } catch (e) {
    console.log('Error awaiting for clients to run', e)
    process.exit(1)
  } finally {
    await Promise.all(browsers.map((it) => it.close()))
  }
})()
