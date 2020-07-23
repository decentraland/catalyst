import { Request, Response } from 'express'
import { Environment, Bean } from '../../../Environment'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata';
import { DAOCache } from '../DAOCache';

export async function getCatalystServersList(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /servers
    try {
        const dao: DAOCache = env.getBean(Bean.DAO)
        const servers: Set<ServerMetadata> = await dao.getServers()
        res.send(Array.from(servers))
    } catch (e) {
        console.log(e)
        res.status(400).send(`Unexpected error: ${e}`)
    }
}

