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

async function runNewPsql() {
  const { stderr } = await execute(`docker run \
    --name postgres \
    -e POSTGRES_PASSWORD=${DEFAULT_DATABASE_CONFIG.password} \
    -e POSTGRES_USER=${DEFAULT_DATABASE_CONFIG.user} \
    -e POSTGRES_DB=${DEFAULT_DATABASE_CONFIG.database} \
    -p ${DEFAULT_DATABASE_CONFIG.port}:5432 \
    -v psql-vol:/var/lib/postgresql/data \
    -d postgres:12`)

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
