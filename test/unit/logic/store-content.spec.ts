import { storeStreamsInBatches } from '../../../src/logic/store-content'

describe('when storing content in batches', () => {
  let storeStream: jest.Mock
  let controller: AbortController
  let error: unknown

  describe('and the signal aborts while the first batch is being written', () => {
    beforeEach(async () => {
      controller = new AbortController()
      storeStream = jest.fn().mockImplementation(async () => controller.abort(new Error('expired')))
      error = await storeStreamsInBatches(
        { storeStream },
        [
          ['first', new Uint8Array([1])],
          ['second', new Uint8Array([2])]
        ],
        controller.signal,
        1
      ).catch((e) => e)
    })

    it('should reject with the abort reason without starting the next batch', () => {
      expect({ error, stored: storeStream.mock.calls.map(([id]) => id) }).toEqual({
        error: new Error('expired'),
        stored: ['first']
      })
    })

    it('should hand the signal to the storage write', () => {
      expect(storeStream).toHaveBeenCalledWith('first', expect.anything(), controller.signal)
    })
  })
})
