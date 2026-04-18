import { Authenticator, AuthChain } from '@dcl/crypto'
import { AttestationValidationResult, OwnershipAttestation, OwnershipAttestationPayload } from './types'

// PoC: hardcoded trusted signer. In production, load from config or on-chain registry.
export const TRUSTED_ATTESTATION_SIGNERS: string[] = [
  '0xfcad0b19bb29d4674531d6f115237e16afce377c'
]

export function isTrustedSigner(address: string): boolean {
  return TRUSTED_ATTESTATION_SIGNERS.some((signer) => signer.toLowerCase() === address.toLowerCase())
}

function parseAttestationPayload(authChain: AuthChain): OwnershipAttestationPayload | null {
  if (authChain.length < 2) {
    return null
  }

  try {
    const payload = JSON.parse(authChain[1].payload)

    if (
      typeof payload.urn !== 'string' ||
      typeof payload.version !== 'number' ||
      typeof payload.beneficiary !== 'string' ||
      typeof payload.itemUrn !== 'string' ||
      typeof payload.issuedAt !== 'number' ||
      typeof payload.expiresAt !== 'number'
    ) {
      return null
    }

    return payload as OwnershipAttestationPayload
  } catch {
    return null
  }
}

/**
 * Reconstruct an OwnershipAttestation from a raw AuthChain.
 * The attestation payload is embedded as signed JSON in authChain[1].payload.
 */
export function reconstructAttestationFromAuthChain(authChain: AuthChain): OwnershipAttestation | null {
  if (!authChain || authChain.length !== 2) {
    return null
  }

  const payload = parseAttestationPayload(authChain)
  if (!payload) {
    return null
  }

  return {
    ...payload,
    authChain
  }
}

async function verifyAttestationSignature(attestation: OwnershipAttestation): Promise<boolean> {
  try {
    const result = await Authenticator.validateSignature(
      attestation.authChain[1].payload,
      attestation.authChain as AuthChain,
      undefined,
      Date.now()
    )
    return result.ok
  } catch {
    return false
  }
}

export async function validateOwnershipAttestation(
  attestation: OwnershipAttestation,
  deployer: string,
  timestamp: number
): Promise<AttestationValidationResult> {
  if (!attestation.authChain || attestation.authChain.length !== 2) {
    return { valid: false, reason: 'Invalid attestation authChain structure' }
  }

  const signerAddress = attestation.authChain[0].payload
  if (!isTrustedSigner(signerAddress)) {
    return { valid: false, reason: `Untrusted attestation signer: ${signerAddress}` }
  }

  const payload = parseAttestationPayload(attestation.authChain as AuthChain)
  if (!payload) {
    return { valid: false, reason: 'Invalid attestation payload' }
  }

  if (payload.version !== 1) {
    return { valid: false, reason: `Unsupported attestation version: ${payload.version}` }
  }

  if (payload.beneficiary.toLowerCase() !== deployer.toLowerCase()) {
    return { valid: false, reason: 'Attestation beneficiary does not match deployer' }
  }

  const timestampSeconds = Math.floor(timestamp / 1000)
  if (timestampSeconds > payload.expiresAt) {
    return { valid: false, reason: 'Attestation expired' }
  }

  const signatureValid = await verifyAttestationSignature(attestation)
  if (!signatureValid) {
    return { valid: false, reason: 'Invalid attestation signature' }
  }

  return { valid: true, itemUrn: payload.itemUrn }
}

export async function validateOwnershipAttestations(
  attestations: OwnershipAttestation[],
  deployer: string,
  timestamp: number
): Promise<{ validUrns: Set<string>; errors: string[] }> {
  const validUrns = new Set<string>()
  const errors: string[] = []

  for (const attestation of attestations) {
    const result = await validateOwnershipAttestation(attestation, deployer, timestamp)

    if (result.valid && result.itemUrn) {
      validUrns.add(result.itemUrn.toLowerCase())
    } else if (result.reason) {
      errors.push(result.reason)
    }
  }

  return { validUrns, errors }
}

export function parseAttestationHeaders(headers: Record<string, string | undefined>): OwnershipAttestation[] {
  const attestations: Map<number, AuthChain> = new Map()
  const headerPattern = /^x-ownership-auth-chain-(\d+)-(\d+)$/i

  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue

    const match = headerPattern.exec(key)
    if (!match) continue

    const attestationIndex = parseInt(match[1], 10)
    const linkIndex = parseInt(match[2], 10)

    if (!attestations.has(attestationIndex)) {
      attestations.set(attestationIndex, [])
    }

    try {
      const link = JSON.parse(value)
      const authChain = attestations.get(attestationIndex)!
      authChain[linkIndex] = link
    } catch {
      // Skip invalid JSON
    }
  }

  const result: OwnershipAttestation[] = []

  for (const [, authChain] of attestations) {
    if (authChain.length !== 2 || !authChain[0] || !authChain[1]) {
      continue
    }

    const payload = parseAttestationPayload(authChain)
    if (!payload) {
      continue
    }

    result.push({
      ...payload,
      authChain
    })
  }

  return result
}

export function parseAttestationsFromField(fieldValue: string | undefined): OwnershipAttestation[] {
  if (!fieldValue) {
    return []
  }

  try {
    const attestations = JSON.parse(fieldValue)
    if (!Array.isArray(attestations)) {
      return []
    }

    return attestations.filter((att) => {
      return (
        att &&
        typeof att.urn === 'string' &&
        typeof att.version === 'number' &&
        typeof att.beneficiary === 'string' &&
        typeof att.itemUrn === 'string' &&
        typeof att.issuedAt === 'number' &&
        typeof att.expiresAt === 'number' &&
        Array.isArray(att.authChain) &&
        att.authChain.length === 2
      )
    })
  } catch {
    return []
  }
}
