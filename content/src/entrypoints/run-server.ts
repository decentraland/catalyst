import { EnvironmentBuilder } from '../Environment'
import { Server } from '../Server'
async function main() {
  const env = await new EnvironmentBuilder().build()
  await new Server(env).start()
}

main().catch((error) => {
  console.log('Can not start server. ' + error)
  process.exit(1)
})
