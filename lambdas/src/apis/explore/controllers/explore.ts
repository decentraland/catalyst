import { Request, Response } from "express";
import { DAOCache } from "../../../service/dao/DAOCache";
import { ServerMetadata } from "decentraland-katalyst-commons/ServerMetadata";
import { SmartContentServerFetcher } from "../../../utils/SmartContentServerFetcher";
import { EntityType, Fetcher, Entity } from "dcl-catalyst-commons";
import { noReject } from "decentraland-katalyst-utils/util";
import { TimeRefreshedDataHolder } from "../../../utils/TimeRefreshedDataHolder";

type ParcelCoord = [number, number];

type RealmInfo = {
  serverName: string;
  layer: string;
  usersCount: number;
  usersMax: number;
  userParcels: ParcelCoord[];
};

export type HotSceneInfoInProgress = {
  id: string;
  name: string;
  baseCoords: ParcelCoord;
  usersTotalCount: number;
  parcels: ParcelCoord[];
  realms: RealmInfo[];
};

export type HotSceneInfo = {
  id: string;
  name: string;
  baseCoords: ParcelCoord;
  usersTotalCount: number;
  realms: RealmInfo[];
};

let exploreCache: TimeRefreshedDataHolder<HotSceneInfo[]>;

export async function hotScenes(daoCache: DAOCache, fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /hot-scenes

  if (!exploreCache) {
    exploreCache = new TimeRefreshedDataHolder(() => fetchHotScenesData(daoCache, fetcher), 60 * 1000);
  }

  const hotScenesData = await exploreCache.get();

  res.status(200).send(hotScenesData);
}

async function fetchHotScenesData(daoCache: DAOCache, fetcher: SmartContentServerFetcher): Promise<HotSceneInfo[]> {
  const contentClient = await fetcher.getContentClient();

  const nodes = await daoCache.getServers();
  const statuses = await fetchStatuses(nodes, fetcher);
  const tiles = getOccupiedTiles(statuses);

  if (tiles.length > 0) {
    const scenes = await contentClient.fetchEntitiesByPointers(EntityType.SCENE as any, tiles);

    const hotScenes: HotSceneInfoInProgress[] = scenes.map(getHotSceneRecordFor);

    countUsers(hotScenes, statuses);

    return hotScenes.sort((scene1, scene2) => scene2.usersTotalCount - scene1.usersTotalCount).map((it) => ({ ...it, parcels: undefined }));
  } else {
    return [];
  }
}

type Layer = {
  name: string;
  usersCount: number;
  maxUsers: number;
  usersParcels: ParcelCoord[];
};

type ServerStatus = {
  name: string;
  layers: Layer[];
};

function countUsers(hotScenes: HotSceneInfoInProgress[], statuses: ServerStatus[]) {
  statuses.forEach((server) =>
    server.layers.forEach((layer) => {
      layer.usersParcels.forEach((parcel) => countUser(parcel, server, layer, hotScenes));
    })
  );
}

function countUser(parcel: ParcelCoord, server: ServerStatus, layer: Layer, hotScenes: HotSceneInfoInProgress[]) {
  const scene = hotScenes.find((it) => it.parcels?.some((sceneParcel) => parcelEqual(parcel, sceneParcel)));
  if (scene) {
    scene.usersTotalCount += 1;
    let realm = scene.realms.find((it) => it.serverName === server.name && it.layer === layer.name);
    if (!realm) {
      realm = {
        serverName: server.name,
        layer: layer.name,
        usersCount: 0,
        usersMax: layer.maxUsers,
        userParcels: [],
      };
      scene.realms.push(realm);
    }
    realm.usersCount += 1;
    realm.userParcels.push(parcel);
  }
}

function getOccupiedTiles(statuses: ServerStatus[]) {
  return [...new Set(statuses.flatMap((it) => it.layers.flatMap((layer) => layer.usersParcels.map((parcel) => `${parcel[0]},${parcel[1]}`))))];
}

function getHotSceneRecordFor(scene: Entity): HotSceneInfoInProgress {
  return {
    id: scene.id,
    name: scene.metadata?.display.title,
    baseCoords: getCoords(scene.metadata?.scene.base),
    usersTotalCount: 0,
    parcels: scene.metadata?.scene.parcels.map(getCoords),
    realms: [],
  };
}

function parcelEqual(parcel1: ParcelCoord, parcel2: ParcelCoord) {
  return parcel1[0] === parcel2[0] && parcel1[1] === parcel2[1];
}

function getCoords(coordsAsString: string): ParcelCoord {
  return coordsAsString.split(",").map((part) => parseInt(part, 10)) as ParcelCoord;
}

async function fetchStatuses(nodes: Set<ServerMetadata>, fetcher: SmartContentServerFetcher): Promise<ServerStatus[]> {
  return (await Promise.all([...nodes].map((it) => fetchStatus(it, fetcher)))).filter((it) => it[0] !== "rejected").map((it) => it[1]);
}

export async function fetchStatus(serverData: ServerMetadata, fetcher: Fetcher) {
  return noReject(fetcher.fetchJson(`${serverData.address}/comms/status?includeLayers=true`, { timeout: "10s" }));
}
