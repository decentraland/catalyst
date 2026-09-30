import { EnvironmentConfig } from '../../../src/Environment'
import {
  createUploadBudget,
  IUploadBudget,
  UploadBudgetExceededError,
  UploadBudgetLease
} from '../../../src/adapters/upload-budget'

type BudgetConfig = {
  capacityBytes: number
  minReservationBytes: number
  maxRequestBytes: number
  maxFileBytes: number
}

function buildComponents({ capacityBytes, minReservationBytes, maxRequestBytes, maxFileBytes }: BudgetConfig) {
  const values: Partial<Record<EnvironmentConfig, number>> = {
    [EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES]: capacityBytes,
    [EnvironmentConfig.MIN_UPLOAD_RESERVATION_BYTES]: minReservationBytes,
    [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: maxRequestBytes,
    [EnvironmentConfig.MAX_UPLOAD_FILE_SIZE]: maxFileBytes
  }
  return {
    env: { getConfig: jest.fn((key: EnvironmentConfig) => values[key]) },
    metrics: { observe: jest.fn(), increment: jest.fn() }
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

describe('when creating the upload budget', () => {
  describe('and the byte budget cannot fit the peak of a single maximum-size request', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 60, maxFileBytes: 41 })
        )
    })

    it('should fail at startup naming the settings and the peak', () => {
      expect(creation).toThrow(
        'MAX_IN_FLIGHT_UPLOAD_BYTES (100) must fit one maximum-size upload: MAX_UPLOAD_TOTAL_SIZE plus up to MAX_UPLOAD_FILE_SIZE (101).'
      )
    })
  })

  describe('and the byte budget cannot fit a single minimum reservation', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, minReservationBytes: 101, maxRequestBytes: 60, maxFileBytes: 40 })
        )
    })

    it('should fail at startup naming both settings', () => {
      expect(creation).toThrow('MAX_IN_FLIGHT_UPLOAD_BYTES (100) must be at least MIN_UPLOAD_RESERVATION_BYTES (101).')
    })
  })

  describe('and the byte budget fits a maximum-size request', () => {
    let components: ReturnType<typeof buildComponents>

    beforeEach(() => {
      components = buildComponents({
        capacityBytes: 100,
        minReservationBytes: 30,
        maxRequestBytes: 60,
        maxFileBytes: 40
      })
      createUploadBudget(components)
    })

    it('should report its capacity', () => {
      expect(components.metrics.observe).toHaveBeenCalledWith('dcl_multipart_upload_capacity_bytes', {}, 100)
    })
  })

  describe('and the byte budget fits the peak of a maximum-size request whose files are smaller than it', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 60, maxFileBytes: 40 })
        )
    })

    it('should create the budget', () => {
      expect(creation).not.toThrow()
    })
  })
})

describe('when acquiring from the upload budget', () => {
  let budget: IUploadBudget

  beforeEach(() => {
    budget = createUploadBudget(
      buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 60, maxFileBytes: 40 })
    )
  })

  describe('and the upload fits the byte budget', () => {
    let lease: UploadBudgetLease

    beforeEach(() => {
      lease = budget.acquire(60)
    })

    it('should admit it with a lease', () => {
      expect(lease).toEqual({ resize: expect.any(Function), release: expect.any(Function) })
    })
  })

  describe('and fewer small uploads are in flight than the budget fits at the minimum reservation', () => {
    let error: unknown

    beforeEach(() => {
      budget.acquire(0)
      budget.acquire(1)
      error = captureError(() => budget.acquire(0))
    })

    it('should admit it', () => {
      expect(error).toBeUndefined()
    })
  })

  describe('and as many small uploads are in flight as the budget fits at the minimum reservation', () => {
    let error: unknown

    beforeEach(() => {
      budget.acquire(0)
      budget.acquire(1)
      budget.acquire(0)
      error = captureError(() => budget.acquire(0))
    })

    it('should reject it', () => {
      expect(error).toEqual(new UploadBudgetExceededError())
    })
  })

  describe('and an upload larger than the minimum reservation is in flight', () => {
    let errors: unknown[]

    beforeEach(() => {
      budget.acquire(70)
      errors = [captureError(() => budget.acquire(0)), captureError(() => budget.acquire(0))]
    })

    it('should count its declared size against the budget', () => {
      expect(errors).toEqual([undefined, new UploadBudgetExceededError()])
    })
  })

  describe('and its bytes exceed the remaining byte budget', () => {
    let error: unknown

    beforeEach(() => {
      budget.acquire(60)
      error = captureError(() => budget.acquire(41))
    })

    it('should reject it', () => {
      expect(error).toEqual(new UploadBudgetExceededError())
    })
  })

  describe('and an earlier lease was released', () => {
    let error: unknown

    beforeEach(() => {
      budget.acquire(60).release()
      error = captureError(() => budget.acquire(100))
    })

    it('should return its bytes to the budget', () => {
      expect(error).toBeUndefined()
    })
  })

  describe('and a lease is released twice', () => {
    let error: unknown

    beforeEach(() => {
      const lease = budget.acquire(60)
      lease.release()
      lease.release()
      budget.acquire(0)
      budget.acquire(0)
      budget.acquire(0)
      error = captureError(() => budget.acquire(0))
    })

    it('should return its bytes only once', () => {
      expect(error).toEqual(new UploadBudgetExceededError())
    })
  })
})

describe('when resizing an upload budget lease', () => {
  let budget: IUploadBudget
  let lease: UploadBudgetLease

  beforeEach(() => {
    budget = createUploadBudget(
      buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 60, maxFileBytes: 40 })
    )
    lease = budget.acquire(10)
  })

  describe('and the new size fits the byte budget', () => {
    let resized: boolean
    let error: unknown

    beforeEach(() => {
      resized = lease.resize(70)
      error = captureError(() => budget.acquire(31))
    })

    it('should grow the reservation', () => {
      expect({ resized, error }).toEqual({ resized: true, error: new UploadBudgetExceededError() })
    })
  })

  describe('and the new size exceeds the byte budget', () => {
    let resized: boolean
    let error: unknown

    beforeEach(() => {
      budget.acquire(40)
      resized = lease.resize(61)
      error = captureError(() => budget.acquire(30))
    })

    it('should refuse and keep the previous reservation', () => {
      expect({ resized, error }).toEqual({ resized: false, error: undefined })
    })
  })

  describe('and the new size is below the minimum reservation', () => {
    let resized: boolean
    let error: unknown

    beforeEach(() => {
      lease.resize(70)
      resized = lease.resize(5)
      budget.acquire(45)
      error = captureError(() => budget.acquire(0))
    })

    it('should shrink the reservation only down to the minimum', () => {
      expect({ resized, error }).toEqual({ resized: true, error: new UploadBudgetExceededError() })
    })
  })

  describe('and the lease was already released', () => {
    let resized: boolean

    beforeEach(() => {
      lease.release()
      resized = lease.resize(20)
    })

    it('should refuse to resize', () => {
      expect(resized).toBe(false)
    })
  })
})
