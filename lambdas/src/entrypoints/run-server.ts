import { Environment } from '../Environment'
import { Server } from '../Server'

Environment.getInstance()
  .then(async (env) => {
    await new Server(env).start()
  })
  .catch((error) => {
    console.log('Can not start Lambdas server: ' + error)
    process.exit(1)
  })
