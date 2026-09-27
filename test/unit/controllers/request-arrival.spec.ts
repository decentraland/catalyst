import { IHttpServerComponent } from '@dcl/core-commons'
import { stampRequestArrival, withRequestArrival } from '../../../src/controllers/request-arrival'

const NOW = 1_700_000_000_000

describe('when stamping a request with its arrival time', () => {
  let handler: jest.Mock<Promise<IHttpServerComponent.IResponse>>
  let result: unknown

  beforeEach(() => {
    handler = jest.fn().mockResolvedValue({ status: 200 })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the handler runs behind the stamp', () => {
    beforeEach(async () => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW)
      const context = {} as IHttpServerComponent.DefaultContext<object>
      result = await stampRequestArrival()(context, () => withRequestArrival(handler)(context))
    })

    it('should hand the handler the time the request arrived', () => {
      expect({ result, arrivedAt: handler.mock.calls[0][0].requestArrivedAt }).toEqual({
        result: { status: 200 },
        arrivedAt: NOW
      })
    })
  })

  describe('and the route did not stamp the request', () => {
    beforeEach(async () => {
      result = await withRequestArrival(handler)({}).catch((error) => error)
    })

    it('should fail instead of running the handler without it', () => {
      expect({ result, handled: handler.mock.calls.length }).toEqual({
        result: new Error('The request was not stamped with its arrival time'),
        handled: 0
      })
    })
  })
})
