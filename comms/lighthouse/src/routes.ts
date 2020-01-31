import express from "express";
import { requireParameters, validatePeerToken } from "./handlers";
import { LayersService } from "./layersService";
import { IRealm } from "peerjs-server";
import { RequestError } from "./errors";

export type RoutesOptions = Partial<{
  env: any;
}>;

export type Services = {
  layersService: LayersService;
  realmProvider: () => IRealm;
};

export function configureRoutes(app: express.Express, services: Services, options: RoutesOptions) {
  const { layersService, realmProvider: getPeerJsRealm } = services;

  const validateLayerExists = (req, res, next) => {
    if (layersService.exists(req.params.layerId)) {
      next();
    } else {
      res.status(404).send({ status: "layer-not-found" });
    }
  };

  app.get("/hello", (req, res, next) => {
    const status = {
      currenTime: Date.now(),
      env: options.env
    };
    res.send(status);
  });

  app.get("/layers", (req, res, next) => {
    res.send(
      layersService.getLayers().map(it => ({
        name: it.id,
        usersCount: it.users.length,
        maxUsers: it.maxUsers
      }))
    );
  });

  app.get("/layers/:layerId/users", validateLayerExists, (req, res, next) => {
    res.send(layersService.getLayerUsers(req.params.layerId));
  });

  app.get("/layers/:layerId/rooms", validateLayerExists, (req, res, next) => {
    res.send(layersService.getRoomsService(req.params.layerId)!.getRoomIds({ userId: req.query.userId }));
  });

  app.get("/layers/:layerId/rooms/:roomId", validateLayerExists, (req, res, next) => {
    const roomUsers = layersService.getRoomsService(req.params.layerId)!.getUsers(req.params.roomId);
    if (typeof roomUsers === "undefined") {
      res.status(404).send({ status: "room-not-found" });
    } else {
      res.send(roomUsers);
    }
  });

  app.put(
    "/layers/:layerId",
    requireParameters(["userId", "peerId"], (req, res) => req.body),
    validatePeerToken(getPeerJsRealm),
    async (req, res, next) => {
      const { layerId } = req.params;
      try {
        const layer = await layersService.setUserLayer(layerId, req.body);
        res.send(layer.users);
      } catch (err) {
        handleError(err, res, next);
      }
    }
  );

  app.put(
    "/layers/:layerId/rooms/:roomId",
    validateLayerExists,
    requireParameters(["userId", "peerId"], (req, res) => req.body),
    validatePeerToken(getPeerJsRealm),
    async (req, res, next) => {
      const { layerId, roomId } = req.params;
      try {
        const room = await layersService.addUserToRoom(layerId, roomId, req.body);
        res.send(room.users);
      } catch (err) {
        handleError(err, res, next);
      }
    }
  );

  app.delete("/layers/:layerId/rooms/:roomId/users/:userId", validateLayerExists, validatePeerToken(getPeerJsRealm), (req, res, next) => {
    const { roomId, userId, layerId } = req.params;
    const room = layersService.getRoomsService(layerId)?.removeUserFromRoom(roomId, userId);
    res.send(room?.users);
  });

  app.delete("/layers/:layerId/users/:userId", validateLayerExists, validatePeerToken(getPeerJsRealm), (req, res, next) => {
    const { userId, layerId } = req.params;
    const layer = layersService.removeUserFromLayer(layerId, userId);
    res.send(layer?.users);
  });

  app.get("/layers/:layerId/topology", validateLayerExists, (req, res, next) => {
    const { layerId } = req.params;
    const topologyInfo = layersService.getLayerTopology(layerId);
    if (req.query.format === "graphviz") {
      res.send(`
      strict digraph graphName {
        concentrate=true
        ${topologyInfo.map(it => `"${it.peerId}"[label="${it.peerId}\\nconns:${it.connectedPeerIds?.length ?? 0}"];`).join("\n")}
        ${topologyInfo.map(it => (it.connectedPeerIds?.length ? it.connectedPeerIds.map(connected => `"${it.peerId}"->"${connected}";`).join("\n") : `"${it.peerId}";`)).join("\n")}
      }`);
    } else {
      res.send(topologyInfo);
    }
  });

  function handleError(err: any, res, next) {
    const statusTexts = {
      400: "bad-request",
      401: "unauthorized",
      402: "method-not-allowed",
      403: "forbidden",
      404: "not-found"
    };

    if (err instanceof RequestError) {
      res.status(err.status).send(JSON.stringify({ status: statusTexts[err.status] ?? "error", message: err.message }));
    } else {
      next(err);
    }
  }
}
