import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { exec } from 'child_process'
import { promisify } from 'util'
import { DEFAULT_DATABASE_CONFIG } from '../Environment'

const execute = promisify(exec)

async function main() {
  await deletePreviousPsql()
  await runNewPsql()
}

main()
  .then(() => console.log('Done!'))
  .catch((error) => console.error(error))

async function containerIsRunning(container: string) {
  const { stdout, stderr } = await execute(`docker container inspect \
    -f '{{.State.Running}}' ${container}`)
  if (stderr) {
    throw new Error(`Error checking container ${container} status. stderr: ${stderr}`)
  }
  const containerState = stdout.trim()
  return containerState === 'true'
}

async function containerExists(container: string) {
  const { stdout, stderr } = await execute(`docker ps -a --format {{.ID}} | grep ${container}`)
  if (stderr) {
    throw new Error(`Error checking container existence: ${stderr}`)
  }
  return stdout.trim() === container
}

async function getContainerLogs(container: string) {
  const { stdout, stderr } = await execute(`docker logs ${container}`)
  return stdout + '\n' + stderr
}

async function runNewPsql() {
  console.log('Running container initialization...')
  const { stdout, stderr } = await execute(`docker run \
    --name postgres \
    -e POSTGRES_PASSWORD=${DEFAULT_DATABASE_CONFIG.password} \
    -e POSTGRES_USER=${DEFAULT_DATABASE_CONFIG.user} \
    -e POSTGRES_DB=${DEFAULT_DATABASE_CONFIG.database} \
    -p ${DEFAULT_DATABASE_CONFIG.port}:5432 \
    -v psql-vol:/var/lib/postgresql/data \
    -d postgres:12`)

  if (stdout) {
    const container = stdout.trim()
    const shortContainer = container.slice(0, 12)
    if (await containerExists(shortContainer)) {
      console.log(`Container created: ${shortContainer}. Waiting to its start...`)
      await sleep(5000)
      if (!(await containerIsRunning(shortContainer))) {
        throw new Error(`Container ${shortContainer} is not running. Logs: \n${await getContainerLogs(shortContainer)}`)
      }
    } else {
      throw new Error(`Container: ${shortContainer} does not exist.`)
    }
  }
  if (stderr) {
    throw new Error(stderr)
  }
}

async function deletePreviousPsql() {
  const { stderr, stdout } = await execute('docker rm -f postgres')
  if (stderr && !stderr.includes('Error: No such container: postgres')) {
    throw new Error('Failed to delete the existing postgres container')
  } else if (stdout) {
    console.log('Deleted the previous container')
  }
}
