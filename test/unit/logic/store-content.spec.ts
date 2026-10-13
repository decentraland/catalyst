import { Readable } from 'stream'
import { storeStreamsInBatches } from '../../../src/logic/store-content'

describe('when storing content in batches', () => {
  let storeStream: jest.Mock
  let controller: AbortController
  let sources: Record<string, Readable>
  let opened: string[]
  let error: unknown

  beforeEach(() => {
    sources = {}
    opened = []
  })

  function openerFor(id: string): () => Readable {
    return () => {
      opened.push(id)
      sources[id] = new Readable({ read() {} })
      return sources[id]
    }
  }

  describe('and the signal aborts while the first batch is being written', () => {
    beforeEach(async () => {
      controller = new AbortController()
      // The storage write gives up on abort without consuming or closing its source.
      storeStream = jest.fn().mockImplementation(async () => {
        controller.abort(new Error('expired'))
        throw controller.signal.reason
      })
      error = await storeStreamsInBatches(
        { storeStream },
        [
          ['first', openerFor('first')],
          ['second', openerFor('second')]
        ],
        controller.signal,
        1
      ).catch((e) => e)
    })

    it('should reject with the abort reason without opening or starting the next batch', () => {
      expect({ error, stored: storeStream.mock.calls.map(([id]) => id), opened }).toEqual({
        error: new Error('expired'),
        stored: ['first'],
        opened: ['first']
      })
    })

    it('should destroy the source of the aborted write so its file is released', () => {
      expect(sources.first.destroyed).toBe(true)
    })

    it('should hand the signal to the storage write', () => {
      expect(storeStream).toHaveBeenCalledWith('first', sources.first, controller.signal)
    })
  })
})
