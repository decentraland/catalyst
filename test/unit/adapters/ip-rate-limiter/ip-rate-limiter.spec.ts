import { createIpRateLimiter, getClientIp } from '../../../../src/adapters/ip-rate-limiter'

describe('createIpRateLimiter', () => {
  describe('when maxRequestsPerMinute is 0', () => {
    it('never rate limits any IP', () => {
      const limiter = createIpRateLimiter(0)
      for (let i = 0; i < 1000; i++) {
        expect(limiter.isRateLimited('1.2.3.4')).toBe(false)
      }
    })
  })

  describe('when maxRequestsPerMinute is negative', () => {
    it('never rate limits any IP', () => {
      const limiter = createIpRateLimiter(-5)
      expect(limiter.isRateLimited('1.2.3.4')).toBe(false)
    })
  })

  describe('when maxRequestsPerMinute is 10', () => {
    let limiter: ReturnType<typeof createIpRateLimiter>

    beforeEach(() => {
      limiter = createIpRateLimiter(10)
    })

    it('allows the first 10 requests from the same IP', () => {
      for (let i = 0; i < 10; i++) {
        expect(limiter.isRateLimited('1.2.3.4')).toBe(false)
      }
    })

    it('blocks the 11th request from the same IP', () => {
      for (let i = 0; i < 10; i++) {
        limiter.isRateLimited('1.2.3.4')
      }
      expect(limiter.isRateLimited('1.2.3.4')).toBe(true)
    })

    it('tracks different IPs independently', () => {
      for (let i = 0; i < 10; i++) {
        limiter.isRateLimited('1.2.3.4')
      }
      expect(limiter.isRateLimited('5.6.7.8')).toBe(false)
    })

    it('continues blocking after the limit is reached', () => {
      for (let i = 0; i < 15; i++) {
        limiter.isRateLimited('1.2.3.4')
      }
      expect(limiter.isRateLimited('1.2.3.4')).toBe(true)
    })
  })
})

describe('getClientIp', () => {
  function makeHeaders(entries: Record<string, string>): Headers {
    const lower: Record<string, string> = {}
    for (const [k, v] of Object.entries(entries)) lower[k.toLowerCase()] = v
    return { get: (name: string) => lower[name.toLowerCase()] ?? null } as unknown as Headers
  }

  it('returns the CF-Connecting-IP header when present', () => {
    const headers = makeHeaders({ 'cf-connecting-ip': '1.2.3.4' })
    expect(getClientIp(headers)).toBe('1.2.3.4')
  })

  it('prefers CF-Connecting-IP over X-Forwarded-For', () => {
    const headers = makeHeaders({
      'cf-connecting-ip': '1.2.3.4',
      'x-forwarded-for': '9.9.9.9, 8.8.8.8'
    })
    expect(getClientIp(headers)).toBe('1.2.3.4')
  })

  it('falls back to the first value in X-Forwarded-For when CF-Connecting-IP is absent', () => {
    const headers = makeHeaders({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' })
    expect(getClientIp(headers)).toBe('9.9.9.9')
  })

  it('trims whitespace from X-Forwarded-For values', () => {
    const headers = makeHeaders({ 'x-forwarded-for': '  9.9.9.9  , 8.8.8.8' })
    expect(getClientIp(headers)).toBe('9.9.9.9')
  })

  it('returns undefined when neither header is present', () => {
    const headers = makeHeaders({})
    expect(getClientIp(headers)).toBeUndefined()
  })

  it('supports IPv6 addresses', () => {
    const headers = makeHeaders({ 'cf-connecting-ip': '2001:db8::1' })
    expect(getClientIp(headers)).toBe('2001:db8::1')
  })

  it('rejects non-IP values to prevent cache-key poisoning', () => {
    const headers = makeHeaders({ 'x-forwarded-for': 'not-an-ip, 1.2.3.4' })
    expect(getClientIp(headers)).toBeUndefined()
  })

  it('rejects header injection attempts', () => {
    const headers = makeHeaders({ 'x-forwarded-for': '1.2.3.4\r\nX-Injected: true' })
    expect(getClientIp(headers)).toBeUndefined()
  })
})
