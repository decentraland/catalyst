import { EthAddress } from '@dcl/schemas'
import { Request, Response } from 'express'
import { DAOCache } from '../../../service/dao/DAOCache'

export type ServerMetadata = {
  baseUrl: string
  owner: EthAddress
  id: string
}

// Method: GET
// Path: /servers
export async function getCatalystServersList(dao: DAOCache, req: Request, res: Response) {
  return getValuesList<ServerMetadata>(dao, (dao) => dao.getServers(), req, res)
}

// Method: GET
// Path: /pois
export async function getPOIsList(dao: DAOCache, req: Request, res: Response) {
  return getValuesList(dao, (dao) => dao.getPOIs(), req, res)
}

// Method: GET
// Path: /denylisted-names
export async function getDenylistedNamesList(dao: DAOCache, req: Request, res: Response) {
  return getValuesList(dao, (dao) => dao.getDenylistedNames(), req, res)
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
