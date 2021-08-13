export enum Errors {
  INVALID_KEY = 'Invalid key provided',
  INVALID_TOKEN = 'Invalid token provided',
  INVALID_WS_PARAMETERS = 'No token, or key supplied to websocket server',
  CONNECTION_LIMIT_EXCEED = 'Server has reached its concurrent user limit',
  NO_AVAILABLE_ID_FOUND = 'No available id has been found'
}

export enum MessageType {
  OPEN = 'OPEN',
  LEAVE = 'LEAVE',
  CANDIDATE = 'CANDIDATE',
  OFFER = 'OFFER',
  ANSWER = 'ANSWER',
  REJECT = 'REJECT',
  EXPIRE = 'EXPIRE',
  HEARTBEAT = 'HEARTBEAT',
  ID_TAKEN = 'ID-TAKEN',
  ERROR = 'ERROR',
  VALIDATION = 'VALIDATION',
  VALIDATION_OK = 'VALIDATION_OK',
  VALIDATION_NOK = 'VALIDATION_NOK',
  ASSIGNED_ID = 'ASSIGNED_ID'
}

export enum IdType {
  SELF_ASSIGNED = 'SELF_ASSIGNED',
  SERVER_ASSIGNED = 'SERVER_ASSIGNED'
}
