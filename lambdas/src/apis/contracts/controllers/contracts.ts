import { Request, Response } from 'express'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata';
import { DAOCache } from '../../../service/dao/DAOCache';

export async function getCatalystServersList(dao: DAOCache, req: Request, res: Response) {
    // Method: GET
    // Path: /servers
    return getValuesList<ServerMetadata>(dao, dao => dao.getServers(), req, res)
}

export async function getPOIsList(dao: DAOCache, req: Request, res: Response) {
    // Method: GET
    // Path: /pois
    return getValuesList(dao, dao => dao.getPOIs(), req, res)
}

export async function getDenylistedNamesList(dao: DAOCache, req: Request, res: Response) {
    // Method: GET
    // Path: /denylisted-names
    return getValuesList(dao, dao => dao.getDenylistedNames(), req, res)
}

async function getValuesList<T>(dao: DAOCache, valuesListFunction: (DAOCache) => Set<T>, req: Request, res: Response) {
    try {
        const values: Set<T> = await valuesListFunction(dao)
        res.send(Array.from(values))
    } catch (e) {
        console.log(e)
        res.status(400).send(`Unexpected error: ${e}`)
    }
}
