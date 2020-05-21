import express from "express";
import { validatePeerToken, requireOneOf, requireAll } from "./handlers";
import { LayersService } from "./layersService";
import { IRealm } from "peerjs-server";
import { RequestError } from "./errors";
import { PeerInfo, Layer } from "./types";
import { PeersService } from "./peersService";
import { validateSignatureHandler } from "decentraland-katalyst-commons/handlers";
import { ConfigService } from "./configService";

export type RoutesOptions = {
  env?: any;
  name: string;
  ethNetwork: string;
  version: string;
  restrictedAccessSigner: string;
};

export type Services = {
  layersService: LayersService;
  realmProvider: () => IRealm;
  peersService: PeersService;
  configService: ConfigService;
};

export function configureRoutes(app: express.Express, services: Services, options: RoutesOptions) {
  const { layersService, realmProvider: getPeerJsRealm, peersService, configService } = services;

  const validateLayerExists = (req, res, next) => {
    if (layersService.exists(req.params.layerId)) {
      next();
    } else {
      res.status(404).send({ status: "layer-not-found" });
    }
  };

  app.get("/status", async (req, res, next) => {
    const status: any = {
      name: options.name,
      version: options.version,
      currenTime: Date.now(),
      env: options.env,
    };

    const globalMaxPerLayer = await configService.getMaxPeersPerLayer();

    if (req.query.includeLayers === "true") {
      status.layers = layersService.getLayers().map((it) => mapLayerToJson(it, globalMaxPerLayer, true));
    }

    res.send(status);
  });

  app.get("/layers", async (req, res, next) => {
    const globalMaxPerLayer = await configService.getMaxPeersPerLayer();
    res.send(layersService.getLayers().map((it) => mapLayerToJson(it, globalMaxPerLayer, req.query.usersParcels === "true")));
  });

  app.get("/layers/:layerId", validateLayerExists, async (req, res, next) => {
    const globalMaxPerLayer = await configService.getMaxPeersPerLayer();
    res.send(mapLayerToJson(layersService.getLayer(req.params.layerId)!, globalMaxPerLayer));
  });

  app.get("/layers/:layerId/users", validateLayerExists, (req, res, next) => {
    res.send(mapUsersToJson(layersService.getLayerPeers(req.params.layerId)));
  });

  app.get("/layers/:layerId/rooms", validateLayerExists, (req, res, next) => {
    res.send(layersService.getRoomsService(req.params.layerId)!.getRoomIds({ peerId: req.query.userId }));
  });

  app.get("/layers/:layerId/rooms/:roomId", validateLayerExists, (req, res, next) => {
    const roomUsers = layersService.getRoomsService(req.params.layerId)!.getPeers(req.params.roomId);
    if (typeof roomUsers === "undefined") {
      res.status(404).send({ status: "room-not-found" });
    } else {
      res.send(mapUsersToJson(roomUsers));
    }
  });

  app.put(
    "/layers/:layerId",
    requireOneOf(["id", "peerId"], (req, res) => req.body),
    validatePeerToken(getPeerJsRealm),
    async (req, res, next) => {
      const { layerId } = req.params;
      try {
        const layer = await layersService.setPeerLayer(layerId, req.body);
        res.send(mapUsersToJson(peersService.getPeersInfo(layer.peers)));
      } catch (err) {
        handleError(err, res, next);
      }
    }
  );

  app.put(
    "/layers/:layerId/rooms/:roomId",
    validateLayerExists,
    requireOneOf(["id", "peerId"], (req, res) => req.body),
    validatePeerToken(getPeerJsRealm),
    async (req, res, next) => {
      const { layerId, roomId } = req.params;
      try {
        const room = await layersService.addPeerToRoom(layerId, roomId, req.body);
        res.send(mapUsersToJson(peersService.getPeersInfo(room.peers)));
      } catch (err) {
        handleError(err, res, next);
      }
    }
  );

  app.delete("/layers/:layerId/rooms/:roomId/users/:userId", validateLayerExists, validatePeerToken(getPeerJsRealm), (req, res, next) => {
    const { roomId, userId, layerId } = req.params;
    const room = layersService.getRoomsService(layerId)?.removePeerFromRoom(roomId, userId);
    res.send(mapUsersToJson(peersService.getPeersInfo(room?.peers ?? [])));
  });

  app.delete("/layers/:layerId/users/:userId", validateLayerExists, validatePeerToken(getPeerJsRealm), (req, res, next) => {
    const { userId, layerId } = req.params;
    const layer = layersService.removePeerFromLayer(layerId, userId);
    res.send(mapUsersToJson(peersService.getPeersInfo(layer?.peers ?? [])));
  });

  app.get("/layers/:layerId/topology", validateLayerExists, (req, res, next) => {
    const { layerId } = req.params;
    const topologyInfo = layersService.getLayerTopology(layerId);
    if (req.query.format === "graphviz") {
      res.send(`
      strict digraph graphName {
        concentrate=true
        ${topologyInfo.map((it) => `"${it.id}"[label="${it.id}\\nconns:${it.connectedPeerIds?.length ?? 0}"];`).join("\n")}
        ${topologyInfo.map((it) => (it.connectedPeerIds?.length ? it.connectedPeerIds.map((connected) => `"${it.id}"->"${connected}";`).join("\n") : `"${it.id}";`)).join("\n")}
      }`);
    } else {
      res.send(topologyInfo);
    }
  });

  app.put(
    "/config",
    requireAll(["config"], (req) => req.body),
    validateSignatureHandler(
      body => JSON.stringify(body.config),
      options.ethNetwork,
      signer => signer?.toLowerCase() == options.restrictedAccessSigner.toLowerCase()
    ),
    async (req, res, next) => {
      const configKeyValues = req.body.config;
      if (!Array.isArray(configKeyValues) || configKeyValues.some((it) => !it.key)) {
        res.status(400).send(JSON.stringify({ status: "bad-request", message: "Expected array body with {key: string, value?: string} elements" }));
      } else {
        const config = await configService.updateConfigs(configKeyValues);
        res.send(config);
      }
    }
  );

  function mapLayerToJson(layer: Layer, globalMaxPerLayer: number | undefined, includeUserParcels: boolean = false) {
    return {
      name: layer.id,
      usersCount: layer.peers.length,
      maxUsers: layer.maxPeers ?? globalMaxPerLayer,
      ...(includeUserParcels && { usersParcels: layer.peers.map((it) => peersService.getPeerInfo(it).parcel).filter((it) => !!it) }),
    };
  }

  function handleError(err: any, res, next) {
    const statusTexts = {
      400: "bad-request",
      401: "unauthorized",
      402: "method-not-allowed",
      403: "forbidden",
      404: "not-found",
    };

    if (err instanceof RequestError) {
      res.status(err.status).send(JSON.stringify({ status: err.statusMessage ?? statusTexts[err.status] ?? "error", message: err.message }));
    } else {
      next(err);
    }
  }

  function mapUsersToJson(user?: PeerInfo[]) {
    return user?.map((it) => ({
      id: it.id,
      userId: it.id,
      protocolVersion: it.protocolVersion,
      peerId: it.id,
      parcel: it.parcel,
      position: it.position,
      lastPing: it.lastPing,
      address: it.address,
    }));
  }
}
