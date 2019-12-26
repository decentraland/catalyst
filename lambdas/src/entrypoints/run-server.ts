import { Server } from "../Server";
import { Environment } from "../Environment";

Environment.getInstance().then(async env => {
    await new Server(env).start()
})
