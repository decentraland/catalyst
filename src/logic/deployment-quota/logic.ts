import { isIP } from 'net'
import { EntityType } from '@dcl/schemas'
import { canonicalizeIpAddress } from '@dcl/rate-limiter-component'
import { InvalidDeploymentQuotaConfigurationError } from './errors'
import { DeploymentQuotaLadder, DeploymentQuotaWindow, IpExemption } from './types'

/** Window lengths are fixed; only the budgets are configurable. A tunable "minute" is not a minute. */
export const DEPLOYMENT_QUOTA_WINDOW_SECONDS: Record<DeploymentQuotaWindow, number> = {
  [DeploymentQuotaWindow.MINUTE]: 60,
  [DeploymentQuotaWindow.HOUR]: 60 * 60,
  [DeploymentQuotaWindow.DAY]: 24 * 60 * 60,
  [DeploymentQuotaWindow.WEEK]: 7 * 24 * 60 * 60
}

/**
 * Evaluation order, shortest window first. A burst trips the minute budget before it can reach the
 * week's, so a client that keeps retrying while throttled drains only the window it already blew.
 */
export const DEPLOYMENT_QUOTA_WINDOWS: readonly DeploymentQuotaWindow[] = [
  DeploymentQuotaWindow.MINUTE,
  DeploymentQuotaWindow.HOUR,
  DeploymentQuotaWindow.DAY,
  DeploymentQuotaWindow.WEEK
]

export function budgetFor(
  ladder: DeploymentQuotaLadder,
  window: DeploymentQuotaWindow,
  entityType: EntityType
): number {
  const budget = ladder[window]
  return budget.perEntityType.get(entityType) ?? budget.default
}

/**
 * Rejects a ladder whose longer window is tighter than a shorter one: the tighter cap is reached
 * first, so the shorter window's budget can never be spent and is dead configuration.
 */
export function assertMonotonicQuotaLadder(ladder: DeploymentQuotaLadder): void {
  const overriddenTypes = new Set<EntityType>()
  for (const window of DEPLOYMENT_QUOTA_WINDOWS) {
    for (const entityType of ladder[window].perEntityType.keys()) {
      overriddenTypes.add(entityType)
    }
  }

  const ladders: { subject: string; budgets: number[] }[] = [
    { subject: 'every entity type', budgets: DEPLOYMENT_QUOTA_WINDOWS.map((window) => ladder[window].default) },
    ...Array.from(overriddenTypes, (entityType) => ({
      subject: `'${entityType}'`,
      budgets: DEPLOYMENT_QUOTA_WINDOWS.map((window) => budgetFor(ladder, window, entityType))
    }))
  ]

  for (const { subject, budgets } of ladders) {
    for (let index = 1; index < budgets.length; index++) {
      if (budgets[index] < budgets[index - 1]) {
        throw new InvalidDeploymentQuotaConfigurationError(
          `The deployment quota for ${subject} allows ${budgets[index]} per ${DEPLOYMENT_QUOTA_WINDOWS[index]} ` +
            `but ${budgets[index - 1]} per ${DEPLOYMENT_QUOTA_WINDOWS[index - 1]}. A longer window must not be ` +
            `tighter than a shorter one, or the shorter one's budget can never be spent.`
        )
      }
    }
  }
}

/** Big-endian bytes of a canonical address, or `null` when it is not one. */
function ipToBytes(canonicalAddress: string): Uint8Array | null {
  const version = isIP(canonicalAddress)
  if (version === 4) {
    return Uint8Array.from(canonicalAddress.split('.'), Number)
  }
  if (version !== 6) {
    return null
  }
  // A canonical IPv6 address is hextets with at most one `::`, never an embedded dotted quad:
  // canonicalizeIpAddress folds the IPv4-mapped form down to IPv4 before this runs.
  const [head, tail] = canonicalAddress.split('::')
  const headHextets = head ? head.split(':') : []
  const tailHextets = tail ? tail.split(':') : []
  const hextets = [...headHextets, ...new Array(8 - headHextets.length - tailHextets.length).fill('0'), ...tailHextets]
  const bytes = new Uint8Array(16)
  hextets.forEach((hextet, index) => {
    const value = parseInt(hextet, 16)
    bytes[index * 2] = value >> 8
    bytes[index * 2 + 1] = value & 0xff
  })
  return bytes
}

/**
 * Parses `DEPLOYMENT_QUOTA_EXEMPT_IPS` entries. A bare address is a full-length prefix, so an address
 * and a CIDR go through one matcher.
 *
 * @throws InvalidDeploymentQuotaConfigurationError so a typo cannot silently exempt nothing.
 */
export function parseIpExemptions(entries: readonly string[]): IpExemption[] {
  return entries.map(parseIpExemption)
}

function parseIpExemption(entry: string): IpExemption {
  const invalid = (reason: string) =>
    new InvalidDeploymentQuotaConfigurationError(`Invalid DEPLOYMENT_QUOTA_EXEMPT_IPS entry "${entry}": ${reason}.`)

  const [rawAddress, rawPrefix, ...rest] = entry.split('/')
  if (rest.length > 0) {
    throw invalid('expected an IP address or a CIDR')
  }

  const canonicalAddress = canonicalizeIpAddress(rawAddress)
  const bytes = canonicalAddress === null ? null : ipToBytes(canonicalAddress)
  if (bytes === null) {
    throw invalid(`"${rawAddress}" is not an IP address`)
  }

  const maxPrefixBits = bytes.length * 8
  if (rawPrefix === undefined) {
    return { bytes, prefixBits: maxPrefixBits }
  }
  if (!/^\d{1,3}$/.test(rawPrefix)) {
    throw invalid('the prefix length is not a number')
  }
  const prefixBits = parseInt(rawPrefix, 10)
  if (prefixBits > maxPrefixBits) {
    throw invalid(`the prefix length must be at most ${maxPrefixBits}`)
  }
  return { bytes, prefixBits }
}

function matchesPrefix(address: Uint8Array, network: Uint8Array, prefixBits: number): boolean {
  const wholeBytes = prefixBits >> 3
  for (let index = 0; index < wholeBytes; index++) {
    if (address[index] !== network[index]) {
      return false
    }
  }
  const remainingBits = prefixBits & 7
  if (remainingBits === 0) {
    return true
  }
  const mask = (0xff << (8 - remainingBits)) & 0xff
  return (address[wholeBytes] & mask) === (network[wholeBytes] & mask)
}

/**
 * Whether an address is exempt. An IPv4 exemption never matches an IPv6 client and vice versa, but it
 * does cover an IPv4-mapped client: canonicalizeIpAddress folds that form down to IPv4 first.
 */
export function isExemptIp(address: string, exemptions: readonly IpExemption[]): boolean {
  if (exemptions.length === 0) {
    return false
  }
  const canonicalAddress = canonicalizeIpAddress(address)
  const bytes = canonicalAddress === null ? null : ipToBytes(canonicalAddress)
  if (bytes === null) {
    return false
  }
  return exemptions.some(
    (exemption) =>
      exemption.bytes.length === bytes.length && matchesPrefix(bytes, exemption.bytes, exemption.prefixBits)
  )
}
