import NodeCache from 'node-cache'
import { IIpRateLimiterComponent } from './types'

export function createIpRateLimiter(maxRequestsPerMinute: number): IIpRateLimiterComponent {
  if (maxRequestsPerMinute <= 0) {
    return { isRateLimited: () => false }
  }

  // stdTTL=60: fixed 60s window — counter resets 60s after the first request in the window.
  // Node.js is single-threaded so read-increment-write is atomic; no locking needed.
  const cache = new NodeCache({ stdTTL: 60, checkperiod: 60, useClones: false })

  return {
    isRateLimited(ip: string): boolean {
      const current = (cache.get<number>(ip) ?? 0) + 1
      cache.set(ip, current)
      return current > maxRequestsPerMinute
    }
  }
}

// Prefers CF-Connecting-IP (Cloudflare real client IP) over X-Forwarded-For.
export function getClientIp(headers: Headers): string | undefined {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    undefined
  )
}
