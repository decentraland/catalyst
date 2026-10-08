import { EnvironmentConfig } from '../../../src/Environment'
import {
  createUploadBudget,
  IUploadBudget,
  SPOOL_FILE_OVERHEAD_BYTES,
  UploadBudgetExceededError,
  UploadBudgetLease
} from '../../../src/adapters/upload-budget'

const GiB = 1024 ** 3
const MiB = 1024 ** 2

type BudgetConfig = { capacityBytes?: number; minReservationBytes: number; maxRequestBytes: number; maxFiles?: number }

function buildComponents({ capacityBytes, minReservationBytes, maxRequestBytes, maxFiles = 0 }: BudgetConfig) {
  const values: Partial<Record<EnvironmentConfig, number>> = {
    [EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES]: capacityBytes,
    [EnvironmentConfig.MAX_IN_MEMORY_DEPLOYMENT_BYTES]: capacityBytes,
    [EnvironmentConfig.MIN_UPLOAD_RESERVATION_BYTES]: minReservationBytes,
    [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: maxRequestBytes,
    [EnvironmentConfig.MAX_UPLOAD_FILE_COUNT]: maxFiles
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
  describe('and the disk budget cannot fit a single maximum-size request', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 101 }),
          'disk'
        )
    })

    it('should fail at startup naming the settings', () => {
      expect(creation).toThrow(
        `MAX_IN_FLIGHT_UPLOAD_BYTES (100) must be at least MAX_UPLOAD_TOTAL_SIZE plus ${SPOOL_FILE_OVERHEAD_BYTES} bytes per MAX_UPLOAD_FILE_COUNT file (101).`
      )
    })
  })

  describe('and the disk budget fits a maximum-size request but not the overhead of its maximum file count', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({
            capacityBytes: 100 + 2 * SPOOL_FILE_OVERHEAD_BYTES,
            minReservationBytes: 30,
            maxRequestBytes: 100,
            maxFiles: 3
          }),
          'disk'
        )
    })

    it('should fail at startup with the capacity a maximum-size request needs', () => {
      expect(creation).toThrow(`(${100 + 3 * SPOOL_FILE_OVERHEAD_BYTES}).`)
    })
  })

  describe('and the disk budget cannot fit a single minimum reservation', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, minReservationBytes: 101, maxRequestBytes: 60 }),
          'disk'
        )
    })

    it('should fail at startup naming both settings', () => {
      expect(creation).toThrow('MAX_IN_FLIGHT_UPLOAD_BYTES (100) must be at least MIN_UPLOAD_RESERVATION_BYTES (101).')
    })
  })

  describe.each([
    ['disk', 4 * GiB],
    ['memory', 3 * GiB]
  ] as const)('and MAX_UPLOAD_TOTAL_SIZE is 3 GiB and the %s budget is unset', (kind, capacityBytes) => {
    let components: ReturnType<typeof buildComponents>

    beforeEach(() => {
      components = buildComponents({ minReservationBytes: 16 * MiB, maxRequestBytes: 3 * GiB, maxFiles: 3000 })
      createUploadBudget(components, kind)
    })

    it(`should start with the larger of its default and one maximum-size request: ${capacityBytes} bytes`, () => {
      expect(components.metrics.observe).toHaveBeenCalledWith(
        'dcl_upload_budget_capacity_bytes',
        { budget: kind },
        capacityBytes
      )
    })
  })

  describe('and MAX_UPLOAD_TOTAL_SIZE is 4 GiB and the disk budget is unset', () => {
    let components: ReturnType<typeof buildComponents>

    beforeEach(() => {
      components = buildComponents({ minReservationBytes: 16 * MiB, maxRequestBytes: 4 * GiB, maxFiles: 3000 })
      createUploadBudget(components, 'disk')
    })

    it('should grow past its 4 GiB default to fit the request and the overhead of its maximum file count', () => {
      expect(components.metrics.observe).toHaveBeenCalledWith(
        'dcl_upload_budget_capacity_bytes',
        { budget: 'disk' },
        4 * GiB + 3000 * SPOOL_FILE_OVERHEAD_BYTES
      )
    })
  })

  describe.each([
    ['disk', 'MAX_IN_FLIGHT_UPLOAD_BYTES'],
    ['memory', 'MAX_IN_MEMORY_DEPLOYMENT_BYTES']
  ] as const)('and MAX_UPLOAD_TOTAL_SIZE is 3 GiB and the %s budget is explicitly set to 2 GiB', (kind, setting) => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 2 * GiB, minReservationBytes: 16 * MiB, maxRequestBytes: 3 * GiB }),
          kind
        )
    })

    it('should still fail at startup rather than derive a larger capacity', () => {
      expect(creation).toThrow(`${setting} (${2 * GiB}) must be at least MAX_UPLOAD_TOTAL_SIZE`)
    })
  })

  describe.each(['disk', 'memory'] as const)('and the %s budget fits a maximum-size request', (kind) => {
    let components: ReturnType<typeof buildComponents>

    beforeEach(() => {
      components = buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 60 })
      createUploadBudget(components, kind)
    })

    it('should report its capacity labeled with the budget', () => {
      expect(components.metrics.observe).toHaveBeenCalledWith('dcl_upload_budget_capacity_bytes', { budget: kind }, 100)
    })
  })

  describe('and the memory budget fits a maximum-size request with its maximum file count', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 100, maxFiles: 3 }),
          'memory'
        )
    })

    it('should not charge the spool file overhead', () => {
      expect(creation).not.toThrow()
    })
  })

  describe('and the memory budget cannot fit a single maximum-size request', () => {
    let creation: () => IUploadBudget

    beforeEach(() => {
      creation = () =>
        createUploadBudget(
          buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 101 }),
          'memory'
        )
    })

    it('should fail at startup naming both settings', () => {
      expect(creation).toThrow('MAX_IN_MEMORY_DEPLOYMENT_BYTES (100) must be at least MAX_UPLOAD_TOTAL_SIZE (101).')
    })
  })
})

describe('when acquiring from the upload budget', () => {
  let budget: IUploadBudget

  beforeEach(() => {
    budget = createUploadBudget(
      buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 100 }),
      'disk'
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

describe('when acquiring from the memory budget', () => {
  let errors: unknown[]

  beforeEach(() => {
    const budget = createUploadBudget(
      buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 100 }),
      'memory'
    )
    errors = [0, 0, 0, 0, 100].map((bytes) => captureError(() => budget.acquire(bytes)))
  })

  it('should reserve exactly the requested bytes, without the minimum reservation', () => {
    expect(errors).toEqual([undefined, undefined, undefined, undefined, undefined])
  })
})

describe('when resizing an upload budget lease', () => {
  let budget: IUploadBudget
  let lease: UploadBudgetLease

  beforeEach(() => {
    budget = createUploadBudget(
      buildComponents({ capacityBytes: 100, minReservationBytes: 30, maxRequestBytes: 100 }),
      'disk'
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
