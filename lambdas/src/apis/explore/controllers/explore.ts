import { Entity, EntityType, EthAddress } from '@dcl/schemas'
import { Request, Response } from 'express'
import fetch from 'node-fetch'
import { DAOCache } from '../../../service/dao/DAOCache'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TimeRefreshedDataHolder } from '../../../utils/TimeRefreshedDataHolder'

// The maximum amount of hot scenes returned
const HOT_SCENES_LIMIT = 100

// This is the contract of the API response, do not change this type
type ServerMetadata = {
  baseUrl: string
  owner: EthAddress
  id: string
}

type ParcelCoord = [number, number]

type RealmInfo = {
  serverName: string
  url: string
  layer?: string
  usersCount: number
  maxUsers?: number
  userParcels: ParcelCoord[]
}

export type HotSceneInfo = {
  id: string
  name: string
  baseCoords: ParcelCoord
  usersTotalCount: number
  parcels: ParcelCoord[]
  thumbnail?: string
  projectId?: string
  creator?: string
  description?: string
  realms: RealmInfo[]
}

type ServerStatusConfig = {
  realmName: string
}
type ServerStatusContent = {
  healthy: boolean
  commitHash: string
  version: string
}

type ServerStatusComms = {
  healthy: boolean
  protocol: string
  commitHash: string
  version: string
  usersCount: number
}

type ServerStatusLambdas = {
  healthy: boolean
  commitHash: string
  version: string
}
type ServerStatusBff = {
  userCount: number
  healthy: boolean
  commitHash: string
}

type ParcelsInfo = {
  peersCount: number
  parcel: {
    x: number
    y: number
  }
}

type ServerStatus = {
  url: string
  healthy: boolean
  configurations: ServerStatusConfig
  content: ServerStatusContent
  comms: ServerStatusComms
  lambdas: ServerStatusLambdas
  bff: ServerStatusBff
  parcels: ParcelsInfo[]
}

let realmsStatusCache: TimeRefreshedDataHolder<RealmInfo[]>

export async function realmsStatus(daoCache: DAOCache, req: Request, res: Response) {
  // Method: GET
  // Path: /realms

  if (!realmsStatusCache) {
    realmsStatusCache = new TimeRefreshedDataHolder(() => fetchRealmsData(daoCache), '1m')
  }

  const realmsStatusData = await realmsStatusCache.get()
  const realmStatusLastUpdate = realmsStatusCache.lastUpdate()

  res.setHeader('Last-Modified', realmStatusLastUpdate.toUTCString())
  res.status(200).send(realmsStatusData)
}

let hotSceneCache: TimeRefreshedDataHolder<HotSceneInfo[]>

export async function hotScenes(daoCache: DAOCache, contentClient: SmartContentClient, req: Request, res: Response) {
  // Method: GET
  // Path: /hot-scenes

  if (!hotSceneCache) {
    hotSceneCache = new TimeRefreshedDataHolder(() => fetchHotScenesData(daoCache, contentClient), '1m')
  }

  const hotScenesData = await hotSceneCache.get()
  const hotScenesLastUpdate = hotSceneCache.lastUpdate()

  res.setHeader('Last-Modified', hotScenesLastUpdate.toUTCString())
  res.status(200).send(hotScenesData)
}

function toRealmsInfo(server: ServerStatus): RealmInfo[] {
  return [
    {
      serverName: server.configurations.realmName,
      url: server.url,
      usersCount: server.comms.usersCount || server.bff.userCount,
      maxUsers: 2000, // This is Kernel's default
      userParcels: toParcelCoord(server.parcels)
    }
  ]
}

async function fetchRealmsData(daoCache: DAOCache): Promise<RealmInfo[]> {
  const statuses: ServerStatus[] = await fetchCatalystStatuses(daoCache)

  return statuses.flatMap(toRealmsInfo).sort((realm1, realm2) => realm2.usersCount - realm1.usersCount)
}

async function fetchHotScenesData(daoCache: DAOCache, contentClient: SmartContentClient): Promise<HotSceneInfo[]> {
  const statuses: ServerStatus[] = await fetchCatalystStatuses(daoCache)
  const tiles = getOccupiedTiles(statuses)

  if (tiles.length > 0) {
    const scenes = await contentClient.fetchEntitiesByPointers(EntityType.SCENE as any, tiles)

    const hotScenes: HotSceneInfo[] = scenes.map((scene) =>
      getHotSceneRecordFor(scene, contentClient.getExternalContentServerUrl())
    )

    countUsers(hotScenes, statuses)

    const value = hotScenes.sort((scene1, scene2) => scene2.usersTotalCount - scene1.usersTotalCount)

    return value.slice(0, HOT_SCENES_LIMIT)
  } else {
    return []
  }
}

async function fetchCatalystStatuses(daoCache: DAOCache): Promise<ServerStatus[]> {
  const nodes = await daoCache.getServers()
  const statuses = await fetchStatuses(nodes)
  return statuses
}

function countUsers(hotScenes: HotSceneInfo[], statuses: ServerStatus[]) {
  statuses.forEach((server) => {
    server.parcels.forEach((p) => countUser(p, server, hotScenes))
  })
}

function countUser(parcel: ParcelsInfo, server: ServerStatus, hotScenes: HotSceneInfo[]) {
  const scene = hotScenes.find((it) =>
    it.parcels?.some((sceneParcel) => parcelEqual([parcel.parcel.x, parcel.parcel.y], sceneParcel))
  )
  if (scene) {
    scene.usersTotalCount += parcel.peersCount
    let realm = scene.realms.find((it) => it.serverName === server.configurations.realmName)
    if (!realm) {
      realm = {
        serverName: server.configurations.realmName,
        url: server.url,
        usersCount: 0,
        maxUsers: 2000, // This is Kernel's default
        userParcels: []
      }
      scene.realms.push(realm)
    }
    realm.usersCount += parcel.peersCount
    for (let i = 0; i < parcel.peersCount; i++) {
      realm.userParcels.push([parcel.parcel.x, parcel.parcel.y])
    }
  }
}

function getTilesOfServer(status: ServerStatus) {
  function toTiles(parcelCoords: ParcelCoord[]) {
    return parcelCoords.map((parcel) => `${parcel[0]},${parcel[1]}`)
  }
  return toTiles(toParcelCoord(status.parcels))
}

function getOccupiedTiles(statuses: ServerStatus[]) {
  return [...new Set(statuses.flatMap((it) => getTilesOfServer(it)))]
}

function getHotSceneRecordFor(scene: Entity, externalContentUrl: string): HotSceneInfo {
  return {
    id: scene.id,
    name: scene.metadata?.display?.title,
    baseCoords: getCoords(scene.metadata?.scene.base),
    usersTotalCount: 0,
    parcels: scene.metadata?.scene.parcels.map(getCoords),
    thumbnail: calculateThumbnail(scene, externalContentUrl),
    creator: scene.metadata?.contact?.name,
    projectId: scene.metadata?.source?.projectId,
    description: scene.metadata?.display?.description,
    realms: []
  }
}

/**
 * The thumbnail could either be a url or the path of one of the uploaded files.
 * In here, we are converting the path to a url that points to the content server
 */
function calculateThumbnail(scene: Entity, externalContentUrl: string): string | undefined {
  let thumbnail: string | undefined = scene.metadata?.display?.navmapThumbnail
  if (thumbnail && !thumbnail.startsWith('http')) {
    // We are assuming that the thumbnail is an uploaded file. We will try to find the matching hash
    const thumbnailHash = scene.content?.find(({ file }) => file === thumbnail)?.hash
    if (thumbnailHash) {
      thumbnail = `${externalContentUrl}/contents/${thumbnailHash}`
    } else {
      // If we couldn't find a file with the correct path, then we ignore whatever was set on the thumbnail property
      thumbnail = undefined
    }
  }
  return thumbnail
}

function parcelEqual(parcel1: ParcelCoord, parcel2: ParcelCoord) {
  return parcel1[0] === parcel2[0] && parcel1[1] === parcel2[1]
}

function getCoords(coordsAsString: string): ParcelCoord {
  return coordsAsString.split(',').map((part) => parseInt(part, 10)) as ParcelCoord
}

async function fetchStatuses(nodes: Set<ServerMetadata>): Promise<ServerStatus[]> {
  return (await Promise.allSettled([...nodes].map((it) => fetchStatus(it))))
    .filter((p) => p.status === 'fulfilled')
    .map((p) => (p as PromiseFulfilledResult<ServerStatus>).value)
}

async function fetchStatus(serverData: ServerMetadata): Promise<ServerStatus> {
  const [about, statsParcel] = await Promise.all([
    fetch(`${serverData.baseUrl}/about`).then((a) => a.json()),
    fetch(`${serverData.baseUrl}/stats/parcels`).then((a) => a.json())
  ])
  return { ...about, ...statsParcel, url: serverData.baseUrl }
}

function toParcelCoord(parcels: ParcelsInfo[]): ParcelCoord[] {
  const result: ParcelCoord[] = []
  parcels.forEach((p) => {
    for (let i = 0; i < p.peersCount; i++) {
      result.push([p.parcel.x, p.parcel.y])
    }
  })
  return result
}
