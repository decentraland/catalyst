import { AuthChain } from '@dcl/crypto'

export interface OwnershipAttestationPayload {
  urn: string
  version: number
  beneficiary: string
  itemUrn: string
  issuedAt: number
  expiresAt: number
}

export interface OwnershipAttestation extends OwnershipAttestationPayload {
  authChain: AuthChain
}

export interface AttestationValidationResult {
  valid: boolean
  reason?: string
  itemUrn?: string
}
