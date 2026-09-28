import { EnvironmentConfig } from '../../../src/Environment'
import {
  createSourceUploadLimits,
  ISourceUploadLimits,
  SourceUploadLease,
  SourceUploadLimitExceededError
} from '../../../src/adapters/source-upload-limits'

type LimitsConfig = {
  maxUploads: number
  maxBytes?: number
  maxRequestBytes: number
  trustedClientIpHeader?: string
}

function buildComponents({ maxUploads, maxBytes, maxRequestBytes, trustedClientIpHeader = 'x-real-ip' }: LimitsConfig) {
  const values: Partial<Record<EnvironmentConfig, number | string | undefined>> = {
    [EnvironmentConfig.MAX_CONCURRENT_UPLOADS_PER_SOURCE]: maxUploads,
    [EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES_PER_SOURCE]: maxBytes,
    [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: maxRequestBytes,
    [EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER]: trustedClientIpHeader || undefined
  }
  const warn = jest.fn()
  return {
    env: { getConfig: jest.fn((key: EnvironmentConfig) => values[key]) },
    logs: { getLogger: jest.fn(() => ({ warn })) },
    metrics: { increment: jest.fn() },
    warn
  } as any
}

function captureError(operation: () => unknown): unknown {
  try {
    operation()
    return undefined
  } catch (error) {
    return error
  }
}

describe('when creating the per-source upload limits', () => {
  describe('and the per-source byte share is smaller than one maximum-size upload', () => {
    let error: unknown

    beforeEach(() => {
      error = captureError(() =>
        createSourceUploadLimits(buildComponents({ maxUploads: 2, maxBytes: 99, maxRequestBytes: 100 }))
      )
    })

    it('should fail at startup naming both settings', () => {
      expect(error).toEqual(
        new Error(
          'MAX_IN_FLIGHT_UPLOAD_BYTES_PER_SOURCE (99) must fit one maximum-size upload: MAX_UPLOAD_TOTAL_SIZE (100).'
        )
      )
    })
  })

  describe('and the per-source byte share is not set', () => {
    let limits: ISourceUploadLimits
    let error: unknown

    beforeEach(() => {
      limits = createSourceUploadLimits(buildComponents({ maxUploads: 2, maxRequestBytes: 100 }))
      limits.acquire('203.0.113.1', 100)
      error = captureError(() => limits.acquire('203.0.113.1', 1))
    })

    it('should give each source one maximum-size upload worth of bytes', () => {
      expect(error).toEqual(new SourceUploadLimitExceededError('source_bytes'))
    })
  })
})

describe('when admitting uploads without a trusted client IP header', () => {
  let components: ReturnType<typeof buildComponents>
  let error: unknown

  beforeEach(() => {
    components = buildComponents({ maxUploads: 1, maxBytes: 100, maxRequestBytes: 100, trustedClientIpHeader: '' })
    const limits = createSourceUploadLimits(components)
    limits.acquire('10.0.0.2', 100)
    error = captureError(() => limits.acquire('10.0.0.2', 100))
  })

  it('should not limit the socket address every proxied client shares', () => {
    expect(error).toBeUndefined()
  })

  it('should warn once at startup that per-source limits are off', () => {
    expect(components.warn).toHaveBeenCalledTimes(1)
  })
})

describe('when admitting uploads by source', () => {
  let components: ReturnType<typeof buildComponents>
  let limits: ISourceUploadLimits
  let first: SourceUploadLease

  beforeEach(() => {
    components = buildComponents({ maxUploads: 2, maxBytes: 100, maxRequestBytes: 100 })
    limits = createSourceUploadLimits(components)
    first = limits.acquire('203.0.113.1', 10)
    limits.acquire('203.0.113.1', 10)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the source already has its maximum uploads in flight', () => {
    let error: unknown

    beforeEach(() => {
      error = captureError(() => limits.acquire('203.0.113.1', 10))
    })

    it('should shed the upload and count the rejection', () => {
      expect({ error, counted: components.metrics.increment.mock.calls }).toEqual({
        error: new SourceUploadLimitExceededError('source_concurrency'),
        counted: [['dcl_multipart_upload_rejections_total', { reason: 'source_concurrency' }]]
      })
    })
  })

  describe('and another source sends an upload', () => {
    let error: unknown

    beforeEach(() => {
      error = captureError(() => limits.acquire('203.0.113.2', 10))
    })

    it('should admit it', () => {
      expect(error).toBeUndefined()
    })
  })

  describe('and one of the source uploads ends', () => {
    let error: unknown

    beforeEach(() => {
      first.release()
      error = captureError(() => limits.acquire('203.0.113.1', 10))
    })

    it('should admit another upload from the source', () => {
      expect(error).toBeUndefined()
    })
  })

  describe('and an ended upload is released twice', () => {
    let error: unknown

    beforeEach(() => {
      first.release()
      first.release()
      limits.acquire('203.0.113.1', 10)
      error = captureError(() => limits.acquire('203.0.113.1', 10))
    })

    it('should return its share only once', () => {
      expect(error).toEqual(new SourceUploadLimitExceededError('source_concurrency'))
    })
  })

  describe('and the upload would take the source past its byte share', () => {
    let error: unknown

    beforeEach(() => {
      first.release()
      error = captureError(() => limits.acquire('203.0.113.1', 91))
    })

    it('should shed the upload', () => {
      expect(error).toEqual(new SourceUploadLimitExceededError('source_bytes'))
    })
  })
})
