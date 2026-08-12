import NodeCache from 'node-cache'
import { IIpRateLimiterComponent } from './types'

const IP_V4_V6_REGEX = /^[\d.:a-fA-F]+$/

export function createIpRateLimiter(maxRequestsPerMinute: number): IIpRateLimiterComponent {
  if (maxRequestsPerMinute <= 0) {
    return { isRateLimited: () => false }
  }

  const cache = new NodeCache({ stdTTL: 60, checkperiod: 60, useClones: false })

  return {
    isRateLimited(ip: string): boolean {
      const existing = cache.get<number>(ip)
      if (existing !== undefined) {
        // Preserve the original TTL so the window is fixed from the first request, not sliding.
        const expiry = cache.getTtl(ip)
        const remainingTtl = expiry ? Math.max(1, Math.ceil((expiry - Date.now()) / 1000)) : 60
        cache.set(ip, existing + 1, remainingTtl)
        return existing + 1 > maxRequestsPerMinute
      }
      cache.set(ip, 1)
      return 1 > maxRequestsPerMinute
    }
  }
}

// CF-Connecting-IP is set by Cloudflare on every proxied request and cannot be spoofed by the client.
// X-Forwarded-For is only used as fallback when CF-Connecting-IP is absent (e.g. direct internal traffic).
export function getClientIp(headers: Headers): string | undefined {
  const raw = headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for')?.split(',')[0].trim()
  if (!raw) return undefined
  // Reject values that don't look like an IPv4/IPv6 address to prevent cache-key poisoning.
  return IP_V4_V6_REGEX.test(raw) ? raw : undefined
}
