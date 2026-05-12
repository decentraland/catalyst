export interface IHashing {
  /**
   * Hash the given files with IPFS hash v1 (CIDv1 / `bafy...`).
   * Used for entities deployed after the IPFS migration.
   */
  calculateIPFSHashes<T extends Uint8Array>(files: T[]): Promise<{ hash: string; file: T }[]>
  /**
   * Hash the given files with the deprecated v0 hash. Kept to verify and
   * re-verify the content of legacy entities deployed before the IPFS migration.
   */
  calculateDeprecatedHashes<T extends Uint8Array>(files: T[]): Promise<{ hash: string; file: T }[]>
}
