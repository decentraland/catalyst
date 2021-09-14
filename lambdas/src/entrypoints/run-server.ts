import { Environment } from '../Environment'
import { Server } from '../Server'

console.debug('Starting lambdas server...')

Environment.getInstance()
  .then(async (env) => {
    await new Server(env).start()
  })
  .catch((error) => {
    console.error('Can not start Lambdas server: ', error)
    process.exit(1)
  })
