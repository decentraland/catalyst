import { EventEmitter } from "eventemitter3";
import { util, isReliable } from "./util";
import logger, { LogLevel } from "./logger";
import { Socket, SocketBuilder } from "./socket";
import { PeerErrorType, PeerEventType, SocketEventType, ServerMessageType } from "./enums";
import { ServerMessage } from "./servermessage";
import { API } from "./api";
import { PeerData } from "../Peer";

export type MessageHandler = {
  handleMessage(messsage: ServerMessage): void;
};

class PeerOptions {
  debug?: LogLevel; // 1: Errors, 2: Warnings, 3: All logs
  host?: string;
  port?: number;
  path?: string;
  key?: string;
  token?: string;
  secure?: boolean;
  pingInterval?: number;
  socketBuilder?: SocketBuilder;
  logFunction?: (logLevel: LogLevel, ...rest: any[]) => void;
  authHandler?: (msg: string) => Promise<string>;
}

//There is repeated code between this function and the one below. Maybe it could be extracted
export function createValidationMessage(myId: string, payload: string) {
  return {
    type: ServerMessageType.Validation,
    src: myId,
    payload
  };
}

export function createOfferMessage(myId: string, peerData: PeerData, offerData: any, connectionId: string, label: string) {
  const payload = {
    browser: "chrome",
    sdp: offerData,
    connectionId: connectionId,
    sessionId: peerData.sessionId,
    label,
    reliable: isReliable(connectionId),
    serialization: "binary"
  };

  const offer = {
    type: ServerMessageType.Offer,
    src: myId,
    dst: peerData.id,
    payload
  };

  return offer;
}

export function createAnswerMessage(myId: string, peerData: PeerData, answerData: any, connectionId: string, label: string) {
  const payload = {
    browser: "chrome",
    sdp: answerData,
    connectionId,
    sessionId: peerData.sessionId,
    label,
    type: "data"
  };

  const answer = {
    type: ServerMessageType.Answer,
    src: myId,
    dst: peerData.id,
    payload
  };

  return answer;
}

export function createCandidateMessage(myId: string, peerData: PeerData, candidateData: any, connectionId: string, label: string) {
  const payload = {
    ...candidateData,
    connectionId: connectionId,
    sessionId: peerData.sessionId,
    label,
    type: "data"
  };
  const candidate = {
    type: ServerMessageType.Candidate,
    src: myId,
    dst: peerData.id,
    payload
  };
  return candidate;
}

/**
 * Connector to the PeerJS server in order to publish and receive connection offers
 */
export class PeerJSServerConnection extends EventEmitter {
  private static readonly DEFAULT_KEY = "peerjs";

  private readonly _options: PeerOptions;
  private _id: string | null;
  private _lastServerId: string | null;
  private _api: API;

  private _messageHandler: MessageHandler;

  // States.
  private _disconnected = false;
  private _open = false;

  private _socket: Socket;

  get id() {
    return this._id;
  }

  get messageHandler() {
    return this._messageHandler;
  }

  get options() {
    return this._options;
  }

  get open() {
    return this._open;
  }

  get socket() {
    return this._socket;
  }

  get disconnected() {
    return this._disconnected;
  }

  constructor(handler: MessageHandler, id?: string, options?: PeerOptions) {
    super();

    let userId: string | undefined;

    // Deal with overloading
    if (id && id.constructor == Object) {
      options = id as PeerOptions;
    } else if (id) {
      userId = id.toString();
    }

    // Configurize options
    options = {
      debug: 0, // 1: Errors, 2: Warnings, 3: All logs
      host: util.CLOUD_HOST,
      port: util.CLOUD_PORT,
      path: "/",
      key: PeerJSServerConnection.DEFAULT_KEY,
      token: util.randomToken(),
      socketBuilder: url => new WebSocket(url),
      ...options
    };

    this._options = options;

    this._messageHandler = handler;

    // Set path correctly.
    if (this._options.path) {
      if (this._options.path[0] !== "/") {
        this._options.path = "/" + this._options.path;
      }
      if (this._options.path[this._options.path.length - 1] !== "/") {
        this._options.path += "/";
      }
    }

    // Set a custom log function if pre sent
    if (this._options.logFunction) {
      logger.setLogFunction(this._options.logFunction);
    }

    logger.logLevel = this._options.debug || 0;

    // Ensure alphanumeric id
    if (!!userId && !util.validateId(userId)) {
      this._delayedAbort(PeerErrorType.InvalidID, `ID "${userId}" is invalid`);
      return;
    }

    this._api = new API(options);

    // Start the server connection
    this._initializeServerConnection();

    if (userId) {
      this._initialize(userId);
    } else {
      this._api
        .retrieveId()
        .then(id => this._initialize(id))
        .catch(error => this._abort(PeerErrorType.ServerError, error));
    }
  }

  // Initialize the 'socket' (which is actually a mix of XHR streaming and
  // websockets.)
  private _initializeServerConnection(): void {
    this._socket = new Socket(
      this._options.secure,
      this._options.host!,
      this._options.port!,
      this._options.path!,
      this._options.key!,
      this._options.pingInterval,
      this._options.socketBuilder!
    );

    this.socket.on(SocketEventType.Message, data => {
      this._handleMessage(data);
    });

    this.socket.on(SocketEventType.Error, error => {
      this._abort(PeerErrorType.SocketError, error);
    });

    this.socket.on(SocketEventType.Disconnected, () => {
      // If we haven't explicitly disconnected, emit error and disconnect.
      if (!this.disconnected) {
        this.emitError(PeerErrorType.Network, "Lost connection to server.");
        this.disconnect();
      }
    });

    this.socket.on(SocketEventType.Close, () => {
      // If we haven't explicitly disconnected, emit error.
      if (!this.disconnected) {
        this._abort(PeerErrorType.SocketClosed, "Underlying socket is already closed.");
      }
    });
  }

  /** Initialize a connection with the server. */
  private _initialize(id: string | null): void {
    this._id = id;
    this.socket.start(this.id || "foo", this._options.token || "asd");
  }

  /** Handles messages from the server. */
  private _handleMessage(message: ServerMessage): void {
    logger.log("Received message", message);
    const type = message.type;
    const payload = message.payload;
    const peerId = message.src;

    switch (type) {
      case ServerMessageType.Open: // The connection to the server is open.
        this.emit(PeerEventType.Open, this.id);
        this._open = true;
        const { authHandler } = this._options;
        if (authHandler && payload) {
          authHandler(payload)
            .then(response => this.sendValidation(response))
            .catch(e => {
              logger.error("error while trying to handle auth message");
              return "";
            });
        }
        break;
      case ServerMessageType.ValidationOk: // The connection to the server is accepted.
        this.emit(PeerEventType.Valid, this.id);
        break;
      case ServerMessageType.ValidationNok: // The connection is aborted due to validation not correct
        this._abort(PeerErrorType.ValidationError, `Result of validation challenge is incorrect`);
        break;
      case ServerMessageType.Error: // Server error.
        this._abort(PeerErrorType.ServerError, payload.msg);
        break;
      case ServerMessageType.IdTaken: // The selected ID is taken.
        this._abort(PeerErrorType.UnavailableID, `ID "${this.id}" is taken`);
        break;
      case ServerMessageType.InvalidKey: // The given API key cannot be found.
        this._abort(PeerErrorType.InvalidKey, `API KEY "${this._options.key}" is invalid`);
        break;
      case ServerMessageType.Expire: // The offer sent to a peer has expired without response.
        this.emitError(PeerErrorType.PeerUnavailable, "Could not connect to peer " + peerId);
        break;
      default:
        //All other messages are handled by the provided handler
        this.messageHandler.handleMessage(message);
        break;
    }
  }

  private _delayedAbort(type: PeerErrorType, message): void {
    setTimeout(() => {
      this._abort(type, message);
    }, 0);
  }

  /**
   * Emits an error message and destroys the Peer.
   * The Peer is not destroyed if it's in a disconnected state, in which case
   * it retains its disconnected state and its existing connections.
   */
  private _abort(type: PeerErrorType, message): void {
    logger.error("Aborting!");

    this.emitError(type, message);

    this.disconnect();
  }

  /** Emits a typed error message. */
  emitError(type: PeerErrorType, err): void {
    logger.error("Error:", err);

    if (typeof err === "string") {
      err = new Error(err);
    }

    err.type = type;

    this.emit(PeerEventType.Error, err);
  }

  /**
   * Disconnects the Peer's connection to the PeerServer. Does not close any
   *  active connections.
   * Warning: The peer can no longer create or accept connections after being
   *  disconnected. It also cannot reconnect to the server.
   */
  disconnect(): void {
    setTimeout(() => {
      if (!this.disconnected) {
        this._disconnected = true;
        this._open = false;
        if (this.socket) {
          this.socket.close();
        }

        this.emit(PeerEventType.Disconnected, this.id);
        this._lastServerId = this.id;
        this._id = null;
      }
    }, 0);
  }

  /** Attempts to reconnect with the same ID. */
  reconnect(): void {
    if (this.disconnected) {
      logger.log("Attempting reconnection to server with ID " + this._lastServerId);
      this._disconnected = false;
      this._initializeServerConnection();
      this._initialize(this._lastServerId);
    } else if (!this.disconnected && !this.open) {
      // Do nothing. We're still connecting the first time.
      logger.error("In a hurry? We're still trying to make the initial connection!");
    } else {
      throw new Error("Peer " + this.id + " cannot reconnect because it is not disconnected from the server!");
    }
  }

  sendValidation(payload: string) {
    this.socket.send(createValidationMessage(this.id!, payload));
  }

  sendOffer(peerData: PeerData, offerData: any, connectionId: string, label: string) {
    this.socket.send(createOfferMessage(this.id!, peerData, offerData, connectionId, label));
  }

  sendAnswer(peerData: PeerData, answerData: any, connectionId: string, label: string) {
    this.socket.send(createAnswerMessage(this.id!, peerData, answerData, connectionId, label));
  }

  sendCandidate(peerData: PeerData, candidateData: any, connectionId: string, label: string) {
    this.socket.send(createCandidateMessage(this.id!, peerData, candidateData, connectionId, label));
  }

  /**
   * Get a list of available peer IDs. If you're running your own server, you'll
   * want to set allow_discovery: true in the PeerServer options. If you're using
   * the cloud server, email team@peerjs.com to get the functionality enabled for
   * your key.
   */
  listAllPeers(cb = (_: any[]) => {}): void {
    this._api
      .listAllPeers()
      .then(peers => cb(peers))
      .catch(error => this._abort(PeerErrorType.ServerError, error));
  }
}
