import {
  Request,
  Response,
  NextFunction,
  RequestHandler
} from "express-serve-static-core";
import { IRealm } from "peerjs-server";
import { PeerHeaders } from "../../peer/src/peerjs-server-connector/enums";

//Validations
export function requireParameters(
  paramNames: string[],
  objectGetter: (req: Request, res: Response) => object
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = paramNames.filter(
      param => typeof objectGetter(req, res)[param] === "undefined"
    );

    if (missing.length > 0) {
      res.status(400).send({
        status: "bad-request",
        message: `Missing required parameters: ${missing.join(",")}`
      });
    } else {
      next();
    }
  };
}

export function validatePeerToken(realmProvider: () => IRealm): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const existingClient = realmProvider().getClientById(req.body.userId);
    if (
      existingClient &&
      existingClient.getToken() !== req.header(PeerHeaders.PeerToken)
    ) {
      res.status(401).send({ status: "invalid-token" });
    } else {
      next();
    }
  };
}
