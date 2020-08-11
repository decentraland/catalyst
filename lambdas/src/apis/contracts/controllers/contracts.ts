import { Request, Response } from 'express'
import { Environment, Bean } from '../../../Environment'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata';
import { DAOCache } from '../DAOCache';

export async function getCatalystServersList(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /servers
    return getValuesList<ServerMetadata>(env, dao => dao.getServers(), req, res)
}

export async function getPOIsList(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /pois
    return getValuesList(env, dao => dao.getPOIs(), req, res)
}

export async function getDenylistedNamesList(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /denylisted-names
    return getValuesList(env, dao => dao.getDenylistedNames(), req, res)
}

async function getValuesList<T>(env: Environment, valuesListFunction: (DAOCache) => Set<T>, req: Request, res: Response) {
    try {
        const dao: DAOCache = env.getBean(Bean.DAO)
        const values: Set<T> = await valuesListFunction(dao)
        res.send(Array.from(values))
    } catch (e) {
        console.log(e)
        res.status(400).send(`Unexpected error: ${e}`)
    }
}
