export type Signature = string;
export type EthAddress = string;

export type IdentityType = {
  privateKey: string;
  publicKey: string;
  address: string;
};

export type AuthChain = AuthLink[];

export type AuthLink = {
  type: AuthLinkType;
  payload: string;
  signature: Signature;
};

export enum AuthLinkType {
  SIGNER = "SIGNER",
  ECDSA_EPHEMERAL = "ECDSA_EPHEMERAL",
  ECDSA_DAPPER_EPHEMERAL = "ECDSA_DAPPER_EPHEMERAL",
  ECDSA_SIGNED_ENTITY = "ECDSA_SIGNED_ENTITY"
}

export type AuditInfo = {
  version: EntityVersion;
  deployedTimestamp: Timestamp;

  authChain: AuthChain;

  overwrittenBy?: EntityId;

  isBlacklisted?: boolean;
  blacklistedContent?: ContentFileHash[];

  originalMetadata?: {
    // This is used for migrations
    originalVersion: EntityVersion;
    data: any;
  };
};
export enum EntityVersion {
  V2 = "v2",
  V3 = "v3"
}

export type Timestamp = number;

export type EntityId = ContentFileHash;
export type ContentFileHash = string;
