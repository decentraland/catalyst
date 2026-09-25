import { EnvironmentConfig } from '../../../src/Environment'
import {
  createUploadBudget,
  IUploadBudget,
  UploadBudgetExceededError,
  UploadBudgetLease
} from '../../../src/adapters/upload-budget'

type BudgetConfig = { capacityBytes: number; maxUploads: number; maxRequestBytes: number; maxFileBytes: number }

function buildComponents({ capacityBytes, maxUploads, maxRequestBytes, maxFileBytes }: BudgetConfig) {
  const values: Partial<Record<EnvironmentConfig, number>> = {
    [EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES]: capacityBytes,
    [EnvironmentConfig.MAX_CONCURRENT_UPLOADS]: maxUploads,
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
          buildComponents({ capacityBytes: 100, maxUploads: 2, maxRequestBytes: 60, maxFileBytes: 41 })
        )
    })

    it('should fail at startup naming the settings and the peak', () => {
      expect(creation).toThrow(
        'MAX_IN_FLIGHT_UPLOAD_BYTES (100) must fit one maximum-size upload: MAX_UPLOAD_TOTAL_SIZE plus up to MAX_UPLOAD_FILE_SIZE (101).'
      )
    })
  })

  describe('and the byte budget fits the peak of a maximum-size request whose files are smaller than it', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, maxUploads: 2, maxRequestBytes: 60, maxFileBytes: 40 })
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
      buildComponents({ capacityBytes: 100, maxUploads: 2, maxRequestBytes: 60, maxFileBytes: 40 })
    )
  })

  describe('and the upload fits the byte and concurrency budgets', () => {
    let lease: UploadBudgetLease

    beforeEach(() => {
      lease = budget.acquire(60)
    })

    it('should admit it with a lease', () => {
      expect(lease).toEqual({ resize: expect.any(Function), release: expect.any(Function) })
    })
  })

  describe('and every concurrent upload slot is taken', () => {
    let error: unknown

    beforeEach(() => {
      budget.acquire(0)
      budget.acquire(0)
      error = captureError(() => budget.acquire(0))
    })

    it('should reject it for concurrency', () => {
      expect(error).toEqual(new UploadBudgetExceededError('concurrency'))
    })
  })

  describe('and its bytes exceed the remaining byte budget', () => {
    let error: unknown

    beforeEach(() => {
      budget.acquire(60)
      error = captureError(() => budget.acquire(41))
    })

    it('should reject it for bytes', () => {
      expect(error).toEqual(new UploadBudgetExceededError('bytes'))
    })
  })

  describe('and an earlier lease was released', () => {
    let error: unknown

    beforeEach(() => {
      budget.acquire(60).release()
      error = captureError(() => budget.acquire(100))
    })

    it('should return its bytes and slot to the budget', () => {
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
      error = captureError(() => budget.acquire(0))
    })

    it('should free its slot only once', () => {
      expect(error).toEqual(new UploadBudgetExceededError('concurrency'))
    })
  })
})

describe('when resizing an upload budget lease', () => {
  let budget: IUploadBudget
  let lease: UploadBudgetLease

  beforeEach(() => {
    budget = createUploadBudget(
      buildComponents({ capacityBytes: 100, maxUploads: 3, maxRequestBytes: 60, maxFileBytes: 40 })
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
      expect({ resized, error }).toEqual({ resized: true, error: new UploadBudgetExceededError('bytes') })
    })
  })

  describe('and the new size exceeds the byte budget', () => {
    let resized: boolean
    let error: unknown

    beforeEach(() => {
      budget.acquire(50)
      resized = lease.resize(51)
      error = captureError(() => budget.acquire(40))
    })

    it('should refuse and keep the previous reservation', () => {
      expect({ resized, error }).toEqual({ resized: false, error: undefined })
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
