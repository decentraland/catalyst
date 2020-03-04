import express from "express";
import { validatePeerToken, requireOneOf } from "./handlers";
import { LayersService } from "./layersService";
import { IRealm } from "peerjs-server";
import { RequestError } from "./errors";
import { PeerInfo, Layer } from "./types";
import { PeersService } from "./peersService";

export type RoutesOptions = {
  env?: any;
  name: string;
  version: string;
};

export type Services = {
  layersService: LayersService;
  realmProvider: () => IRealm;
  peersService: PeersService;
};

export function configureRoutes(app: express.Express, services: Services, options: RoutesOptions) {
  const { layersService, realmProvider: getPeerJsRealm, peersService } = services;

  const validateLayerExists = (req, res, next) => {
    if (layersService.exists(req.params.layerId)) {
      next();
    } else {
      res.status(404).send({ status: "layer-not-found" });
    }
  };

  app.get("/status", (req, res, next) => {
    const status: any = {
      name: options.name,
      version: options.version,
      currenTime: Date.now(),
      env: options.env
    };

    if (req.query.includeLayers === "true") {
      status.layers = layersService.getLayers().map(it => mapLayerToJson(it, true));
    }

    res.send(status);
  });

  app.get("/layers", (req, res, next) => {
    res.send(layersService.getLayers().map(it => mapLayerToJson(it, req.query.usersParcels === "true")));
  });

  app.get("/layers/:layerId", validateLayerExists, (req, res, next) => {
    res.send(mapLayerToJson(layersService.getLayer(req.params.layerId)!));
  });

  app.get("/layers/:layerId/users", validateLayerExists, (req, res, next) => {
    res.send(mapUsersToJson(layersService.getLayerUsers(req.params.layerId)));
  });

  app.get("/layers/:layerId/rooms", validateLayerExists, (req, res, next) => {
    res.send(layersService.getRoomsService(req.params.layerId)!.getRoomIds({ peerId: req.query.userId }));
  });

  app.get("/layers/:layerId/rooms/:roomId", validateLayerExists, (req, res, next) => {
    const roomUsers = layersService.getRoomsService(req.params.layerId)!.getUsers(req.params.roomId);
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
        res.send(mapUsersToJson(peersService.getPeersInfo(layer.users)));
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
        res.send(mapUsersToJson(peersService.getPeersInfo(room.users)));
      } catch (err) {
        handleError(err, res, next);
      }
    }
  );

  app.delete("/layers/:layerId/rooms/:roomId/users/:userId", validateLayerExists, validatePeerToken(getPeerJsRealm), (req, res, next) => {
    const { roomId, userId, layerId } = req.params;
    const room = layersService.getRoomsService(layerId)?.removeUserFromRoom(roomId, userId);
    res.send(mapUsersToJson(peersService.getPeersInfo(room?.users ?? [])));
  });

  app.delete("/layers/:layerId/users/:userId", validateLayerExists, validatePeerToken(getPeerJsRealm), (req, res, next) => {
    const { userId, layerId } = req.params;
    const layer = layersService.removeUserFromLayer(layerId, userId);
    res.send(mapUsersToJson(peersService.getPeersInfo(layer?.users ?? [])));
  });

  app.get("/layers/:layerId/topology", validateLayerExists, (req, res, next) => {
    const { layerId } = req.params;
    const topologyInfo = layersService.getLayerTopology(layerId);
    if (req.query.format === "graphviz") {
      res.send(`
      strict digraph graphName {
        concentrate=true
        ${topologyInfo.map(it => `"${it.id}"[label="${it.id}\\nconns:${it.connectedPeerIds?.length ?? 0}"];`).join("\n")}
        ${topologyInfo.map(it => (it.connectedPeerIds?.length ? it.connectedPeerIds.map(connected => `"${it.id}"->"${connected}";`).join("\n") : `"${it.id}";`)).join("\n")}
      }`);
    } else {
      res.send(topologyInfo);
    }
  });

  function mapLayerToJson(layer: Layer, includeUserParcels: boolean = false) {
    return {
      name: layer.id,
      usersCount: layer.users.length,
      maxUsers: layer.maxUsers,
      ...(includeUserParcels && { usersParcels: layer.users.map(it => peersService.getPeerInfo(it).parcel).filter(it => !!it) })
    };
  }

  function handleError(err: any, res, next) {
    const statusTexts = {
      400: "bad-request",
      401: "unauthorized",
      402: "method-not-allowed",
      403: "forbidden",
      404: "not-found"
    };

    if (err instanceof RequestError) {
      res.status(err.status).send(JSON.stringify({ status: err.statusMessage ?? statusTexts[err.status] ?? "error", message: err.message }));
    } else {
      next(err);
    }
  }

  function mapUsersToJson(user?: PeerInfo[]) {
    return user?.map(it => ({ id: it.id, userId: it.id, protocolVersion: it.protocolVersion, peerId: it.id, parcel: it.parcel }));
  }
}
