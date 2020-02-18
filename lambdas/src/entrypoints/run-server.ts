import { Server } from "../Server";
import { Environment } from "../Environment";

Environment.getInstance()
.then(async env => {
    await new Server(env).start()
})
.catch(error => {
    console.log("Can not start Lambdas server: " + error)
    process.exit(1)
})
