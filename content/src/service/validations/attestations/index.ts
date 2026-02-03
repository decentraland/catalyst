export * from './types'
export {
  isTrustedSigner,
  parseAttestationHeaders,
  parseAttestationsFromField,
  reconstructAttestationFromAuthChain,
  TRUSTED_ATTESTATION_SIGNERS,
  validateOwnershipAttestation,
  validateOwnershipAttestations
} from './validator'
