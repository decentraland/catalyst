import { EntityType } from '@dcl/schemas'
import {
  DEPLOYMENT_QUOTA_WINDOWS,
  DEPLOYMENT_QUOTA_WINDOW_SECONDS,
  DeploymentQuotaWindow,
  assertMonotonicQuotaLadder,
  budgetFor,
  isExemptIp,
  parseIpExemptions
} from '../../../../src/logic/deployment-quota'
import { DeploymentQuotaLadder } from '../../../../src/logic/deployment-quota/types'

/** A ladder with the same budget in every window, so a test only states what it changes. */
function buildLadder(
  overrides: Partial<Record<DeploymentQuotaWindow, Partial<DeploymentQuotaLadder[DeploymentQuotaWindow]>>> = {}
): DeploymentQuotaLadder {
  const ladder = {} as DeploymentQuotaLadder
  for (const window of DEPLOYMENT_QUOTA_WINDOWS) {
    ladder[window] = {
      default: overrides[window]?.default ?? 100,
      perEntityType: overrides[window]?.perEntityType ?? new Map()
    }
  }
  return ladder
}

describe('when reading the window table', () => {
  it('should evaluate the windows shortest first, so a burst trips the minute before the week', () => {
    expect(DEPLOYMENT_QUOTA_WINDOWS.map((window) => DEPLOYMENT_QUOTA_WINDOW_SECONDS[window])).toEqual([
      60, 3600, 86400, 604800
    ])
  })
})

describe('when resolving the budget of an entity type', () => {
  let ladder: DeploymentQuotaLadder

  beforeEach(() => {
    ladder = buildLadder({
      [DeploymentQuotaWindow.HOUR]: { default: 600, perEntityType: new Map([[EntityType.SCENE, 20]]) }
    })
  })

  describe('and the entity type has an override for that window', () => {
    it("should return the override instead of the window's default", () => {
      expect(budgetFor(ladder, DeploymentQuotaWindow.HOUR, EntityType.SCENE)).toBe(20)
    })
  })

  describe('and the entity type has no override for that window', () => {
    it("should fall back to the window's default", () => {
      expect(budgetFor(ladder, DeploymentQuotaWindow.HOUR, EntityType.PROFILE)).toBe(600)
    })
  })

  describe('and the override belongs to a different window', () => {
    it('should not leak into the window being asked about', () => {
      expect(budgetFor(ladder, DeploymentQuotaWindow.DAY, EntityType.SCENE)).toBe(100)
    })
  })
})

describe('when validating a quota ladder', () => {
  describe('and every window is at least as generous as the shorter one', () => {
    let ladder: DeploymentQuotaLadder

    beforeEach(() => {
      ladder = buildLadder({
        [DeploymentQuotaWindow.MINUTE]: { default: 60 },
        [DeploymentQuotaWindow.HOUR]: { default: 600 },
        [DeploymentQuotaWindow.DAY]: { default: 3000 },
        [DeploymentQuotaWindow.WEEK]: { default: 10000 }
      })
    })

    it('should accept it', () => {
      expect(() => assertMonotonicQuotaLadder(ladder)).not.toThrow()
    })
  })

  describe('and two windows hold the same budget', () => {
    let ladder: DeploymentQuotaLadder

    beforeEach(() => {
      ladder = buildLadder()
    })

    it('should accept it, since the shorter budget is still reachable', () => {
      expect(() => assertMonotonicQuotaLadder(ladder)).not.toThrow()
    })
  })

  describe('and a longer window is tighter than a shorter one', () => {
    let ladder: DeploymentQuotaLadder

    beforeEach(() => {
      ladder = buildLadder({
        [DeploymentQuotaWindow.MINUTE]: { default: 60 },
        [DeploymentQuotaWindow.HOUR]: { default: 10 }
      })
    })

    it("should reject it, since the shorter window's budget could never be spent", () => {
      expect(() => assertMonotonicQuotaLadder(ladder)).toThrow(
        'The deployment quota for every entity type allows 10 per hour but 60 per minute'
      )
    })
  })

  describe('and only one entity type breaks the order through its overrides', () => {
    let ladder: DeploymentQuotaLadder

    beforeEach(() => {
      // Every default stays flat, so only the scene override breaks the order.
      ladder = buildLadder({
        [DeploymentQuotaWindow.DAY]: { perEntityType: new Map([[EntityType.SCENE, 5]]) }
      })
    })

    it('should reject it and name that entity type', () => {
      expect(() => assertMonotonicQuotaLadder(ladder)).toThrow(
        "The deployment quota for 'scene' allows 5 per day but 100 per hour"
      )
    })
  })
})

describe('when parsing the exempt address list', () => {
  describe('and the list is empty', () => {
    it('should produce no exemptions', () => {
      expect(parseIpExemptions([])).toEqual([])
    })
  })

  describe('and an entry is a bare IPv4 address', () => {
    it('should treat it as a full-length prefix', () => {
      expect(parseIpExemptions(['203.0.113.7'])).toEqual([{ bytes: Uint8Array.from([203, 0, 113, 7]), prefixBits: 32 }])
    })
  })

  describe('and an entry is a bare IPv6 address', () => {
    it('should treat it as a full-length prefix', () => {
      expect(parseIpExemptions(['2001:db8::1'])[0].prefixBits).toBe(128)
    })
  })

  describe('and an entry is not an address', () => {
    it('should reject it, so a typo cannot silently exempt nothing', () => {
      expect(() => parseIpExemptions(['not-an-ip'])).toThrow(
        'Invalid DEPLOYMENT_QUOTA_EXEMPT_IPS entry "not-an-ip": "not-an-ip" is not an IP address'
      )
    })
  })

  describe('and an entry has a non-numeric prefix length', () => {
    it('should reject it', () => {
      expect(() => parseIpExemptions(['10.0.0.0/eight'])).toThrow('the prefix length is not a number')
    })
  })

  describe('and an entry has a prefix longer than the address', () => {
    it('should reject it', () => {
      expect(() => parseIpExemptions(['10.0.0.0/33'])).toThrow('the prefix length must be at most 32')
    })
  })

  describe('and an entry carries more than one slash', () => {
    it('should reject it', () => {
      expect(() => parseIpExemptions(['10.0.0.0/8/8'])).toThrow('expected an IP address or a CIDR')
    })
  })
})

describe('when matching a client address against the exempt list', () => {
  describe('and the list is empty', () => {
    it('should exempt nothing', () => {
      expect(isExemptIp('203.0.113.7', [])).toBe(false)
    })
  })

  describe('and the address is listed exactly', () => {
    it('should exempt it', () => {
      expect(isExemptIp('203.0.113.7', parseIpExemptions(['203.0.113.7']))).toBe(true)
    })
  })

  describe('and a different address is listed', () => {
    it('should not exempt it', () => {
      expect(isExemptIp('203.0.113.8', parseIpExemptions(['203.0.113.7']))).toBe(false)
    })
  })

  describe('and the address falls inside a listed IPv4 CIDR', () => {
    it('should exempt it', () => {
      expect(isExemptIp('198.51.100.42', parseIpExemptions(['198.51.100.0/24']))).toBe(true)
    })
  })

  describe('and the address falls just outside a listed IPv4 CIDR', () => {
    it('should not exempt it', () => {
      expect(isExemptIp('198.51.101.1', parseIpExemptions(['198.51.100.0/24']))).toBe(false)
    })
  })

  describe('and the CIDR does not end on a byte boundary', () => {
    it('should compare only the bits inside the prefix', () => {
      expect([
        isExemptIp('198.51.100.126', parseIpExemptions(['198.51.100.64/26'])),
        isExemptIp('198.51.100.128', parseIpExemptions(['198.51.100.64/26']))
      ]).toEqual([true, false])
    })
  })

  describe('and the address falls inside a listed IPv6 CIDR', () => {
    it('should exempt it', () => {
      expect(isExemptIp('2001:db8:1234::5', parseIpExemptions(['2001:db8::/32']))).toBe(true)
    })
  })

  describe('and the address is an IPv6 spelling of a listed IPv6 address', () => {
    it('should exempt it, since both are canonicalized first', () => {
      expect(isExemptIp('2001:0DB8:0000:0000:0000:0000:0000:0001', parseIpExemptions(['2001:db8::1']))).toBe(true)
    })
  })

  describe('and the address arrives in IPv4-mapped IPv6 form', () => {
    it('should be exempted by the IPv4 entry it maps to', () => {
      expect(isExemptIp('::ffff:203.0.113.7', parseIpExemptions(['203.0.113.7']))).toBe(true)
    })
  })

  describe('and an IPv4 CIDR is matched against an IPv6 client', () => {
    it('should not exempt it, since the families are compared separately', () => {
      expect(isExemptIp('2001:db8::1', parseIpExemptions(['0.0.0.0/0']))).toBe(false)
    })
  })

  describe('and the address is not an address at all', () => {
    it('should not exempt it', () => {
      expect(isExemptIp('nonsense', parseIpExemptions(['0.0.0.0/0']))).toBe(false)
    })
  })
})
