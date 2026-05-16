import { createQueryParams, IQueryParams } from '../../../../src/logic/query-params'

describe('when parsing raw URLSearchParams', () => {
  let queryParams: IQueryParams

  beforeEach(() => {
    queryParams = createQueryParams()
  })

  describe('and the search params contain repeated keys', () => {
    it('should parse them into an array', () => {
      const parsed = queryParams.qsParser(new URLSearchParams('cid=a&cid=b'))
      expect(parsed.cid).toEqual(['a', 'b'])
    })
  })

  describe('and the search params are empty', () => {
    it('should return an empty object', () => {
      expect(queryParams.qsParser(new URLSearchParams(''))).toEqual({})
    })
  })
})

describe('when reading an array param via qsGetArray', () => {
  let queryParams: IQueryParams

  beforeEach(() => {
    queryParams = createQueryParams()
  })

  describe('and the param is missing', () => {
    it('should return an empty array', () => {
      expect(queryParams.qsGetArray({}, 'pointer')).toEqual([])
    })
  })

  describe('and the param has a single value', () => {
    it('should wrap it in a single-element array', () => {
      expect(queryParams.qsGetArray({ pointer: 'a' }, 'pointer')).toEqual(['a'])
    })
  })

  describe('and the param is already an array', () => {
    it('should return it as-is', () => {
      expect(queryParams.qsGetArray({ pointer: ['a', 'b'] }, 'pointer')).toEqual(['a', 'b'])
    })
  })
})

describe('when reading a numeric param via qsGetNumber', () => {
  let queryParams: IQueryParams

  beforeEach(() => {
    queryParams = createQueryParams()
  })

  describe('and the param is a valid integer string', () => {
    it('should return the parsed number', () => {
      expect(queryParams.qsGetNumber({ limit: '42' }, 'limit')).toBe(42)
    })
  })

  describe('and the param is missing', () => {
    it('should return undefined', () => {
      expect(queryParams.qsGetNumber({}, 'limit')).toBeUndefined()
    })
  })

  describe('and the param is non-numeric', () => {
    it('should return undefined', () => {
      expect(queryParams.qsGetNumber({ limit: 'abc' }, 'limit')).toBeUndefined()
    })
  })
})

describe('when reading a boolean param via qsGetBoolean', () => {
  let queryParams: IQueryParams

  beforeEach(() => {
    queryParams = createQueryParams()
  })

  describe('and the value is the literal "true"', () => {
    it('should return true', () => {
      expect(queryParams.qsGetBoolean({ flag: 'true' }, 'flag')).toBe(true)
    })
  })

  describe('and the value is anything else', () => {
    it('should return false', () => {
      expect(queryParams.qsGetBoolean({ flag: 'yes' }, 'flag')).toBe(false)
    })
  })

  describe('and the param is missing', () => {
    it('should return undefined', () => {
      expect(queryParams.qsGetBoolean({}, 'flag')).toBeUndefined()
    })
  })
})

describe('when serializing filters via toQueryParams', () => {
  let queryParams: IQueryParams

  beforeEach(() => {
    queryParams = createQueryParams()
  })

  describe('and a value is an array under a plural key', () => {
    it('should singularize the key and emit one occurrence per element', () => {
      expect(queryParams.toQueryParams({ entityIds: ['a', 'b'] })).toBe('entityId=a&entityId=b')
    })
  })

  describe('and a value is a primitive number, boolean, or string', () => {
    it('should serialize it directly under its original key', () => {
      expect(queryParams.toQueryParams({ limit: 10, includeAuthChain: true, sortBy: 'asc' })).toBe(
        'limit=10&includeAuthChain=true&sortBy=asc'
      )
    })
  })

  describe('and a value is falsy or empty', () => {
    it('should drop it from the resulting query string', () => {
      expect(queryParams.toQueryParams({ a: undefined, b: null, c: 0, d: '' })).toBe('')
    })
  })

  describe('and a value has an unsupported type (object)', () => {
    it('should throw a descriptive error', () => {
      expect(() => queryParams.toQueryParams({ filter: { nested: 'value' } })).toThrow(
        'Query params must be either a string, a number, a boolean or an array of the types just mentioned'
      )
    })
  })
})
