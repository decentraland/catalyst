import { requireAll, requireOneOf, validatePeerToken } from '../src/misc/handlers'

describe('require parameters', () => {
  let request: any
  let response: any
  let next: any

  beforeEach(() => {
    request = {
      body: {}
    }

    response = createResponse()

    next = jest.fn()
  })

  describe('requireAll', () => {
    it('should respond 400 when parameters are missing', () => {
      const handler = requireAll(['name', 'age'], (req, res) => req.body)

      handler(request, response, next)

      expectMissingParameters(response, 'name, age', next)
    })

    it('should respond 400 when some parameters are missing', () => {
      const handler = requireAll(['name', 'age', 'surname'], (req, res) => req.body)

      request.body = { name: 'pepe' }

      handler(request, response, next)

      expectMissingParameters(response, 'age, surname', next)
    })

    it('should work when all parameters are provided', () => {
      const handler = requireAll(['name', 'age'], (req, res) => req.body)

      request.body = { name: 'pepe', age: 33 }

      handler(request, response, next)

      expect(next).toHaveBeenCalled()
    })

    function expectMissingParameters(response: any, parameters: string, next: any) {
      expectBadRequest(response, `Missing required parameters: ${parameters}`, next)
    }
  })

  describe('requireOneOf', () => {
    it('should respond 400 when all parameters are missing', () => {
      const handler = requireOneOf(['id', 'userId'], (req, res) => req.body)

      handler(request, response, next)

      expectRequireOneOf(response, 'id, userId', next)
    })

    it('should respond ok when any of the parameters is included', () => {
      const handler = requireOneOf(['id', 'userId'], (req, res) => req.body)

      request.body = { id: 'id' }
      handler(request, response, next)
      expect(next).toHaveBeenCalled()

      next = jest.fn()
      request.body = { userId: 'userId' }
      handler(request, response, next)
      expect(next).toHaveBeenCalled()
    })

    function expectRequireOneOf(response: any, parameters: string, next: any) {
      expectBadRequest(response, `Missing required parameters: Must have at least one of ${parameters}`, next)
    }
  })

  function expectBadRequest(response: any, message: string, next: any) {
    expect(response.statusCode).toBe(400)
    expect(response.sent).toEqual({
      status: 'bad-request',
      message
    })
    expect(next).not.toHaveBeenCalled()
  }
})

describe('Validate token', () => {
  let request: any
  let response: any
  let realm: any
  let next: any
  let authenticated: boolean = true

  const validToken = 'valid-token'

  beforeEach(() => {
    authenticated = true
    request = {
      header(header: string) {
        return this._token
      },
      body: { userId: 'userId' }
    }
    response = createResponse()
    realm = {
      getClientById(id) {
        return {
          getToken: () => validToken,
          isAuthenticated: () => authenticated
        }
      }
    }
    next = jest.fn()
  })

  it('should reject when no token is provided', () => {
    const handler = validatePeerToken(() => realm)

    handler(request, response, next)

    expectInvalidToken(response)
  })

  it('should reject when the token is not the one in the realm', () => {
    const handler = validatePeerToken(() => realm)

    request._token = 'not-valid-token'

    handler(request, response, next)

    expectInvalidToken(response)
  })

  it('should allow when the token is the one in the realm', () => {
    const handler = validatePeerToken(() => realm)

    request._token = validToken

    handler(request, response, next)

    expect(next).toHaveBeenCalled()
  })

  it('should reject when the user is not authenticated', () => {
    const handler = validatePeerToken(() => realm)

    request._token = validToken

    authenticated = false

    handler(request, response, next)

    expectInvalidToken(response)
  })

  function expectInvalidToken(response: any) {
    expect(response.statusCode).toBe(401)
    expect(response.sent).toEqual({ status: 'unauthorized' })
    expect(next).not.toHaveBeenCalled()
  }
})

function createResponse(): any {
  return {
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(obj: any) {
      this.sent = obj
      return this
    }
  }
}
