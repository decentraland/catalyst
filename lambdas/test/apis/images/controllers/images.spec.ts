import { Request, Response } from 'express'
import fs from 'fs'
import fetch from 'node-fetch'
import { PassThrough } from 'stream'
import { getResizedImage } from '../../../../src/apis/images/controllers/images'
import { SmartContentServerFetcher } from '../../../../src/utils/SmartContentServerFetcher'

jest.mock('node-fetch')
jest.mock('sharp', () => {
  const sharpInstance = {
    resize: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue(undefined)
  }
  return jest.fn(() => sharpInstance)
})
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined)
}))

const VALID_CID_V0 = 'QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB'
const VALID_CID_V1 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

describe('getResizedImage', () => {
  let req: Request
  let res: Response
  let fetcher: SmartContentServerFetcher
  let statusFn: jest.Mock
  let sendFn: jest.Mock
  let writeHeadFn: jest.Mock
  let endFn: jest.Mock

  beforeEach(() => {
    sendFn = jest.fn()
    endFn = jest.fn()
    statusFn = jest.fn().mockReturnValue({ send: sendFn, end: endFn })
    writeHeadFn = jest.fn()

    req = { params: {} } as unknown as Request
    res = {
      status: statusFn,
      writeHead: writeHeadFn,
      end: endFn,
      pipe: jest.fn(),
      on: jest.fn()
    } as unknown as Response

    fetcher = {
      getContentServerUrl: jest.fn().mockResolvedValue('http://content-server')
    } as unknown as SmartContentServerFetcher
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when the CID is a valid CIDv0', () => {
    beforeEach(() => {
      req.params = { cid: VALID_CID_V0, size: '128' }
    })

    describe('and the image is already cached on disk', () => {
      beforeEach(() => {
        jest.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 100 } as fs.Stats)
        jest.spyOn(fs, 'createReadStream').mockReturnValue(new PassThrough() as any)
      })

      it('should respond with 200', async () => {
        await getResizedImage(fetcher, '/tmp/test-storage', req, res)

        expect(writeHeadFn).toHaveBeenCalledWith(
          200,
          expect.objectContaining({ 'Content-Type': 'application/octet-stream' })
        )
      })

      it('should include a quoted ETag header', async () => {
        await getResizedImage(fetcher, '/tmp/test-storage', req, res)

        expect(writeHeadFn).toHaveBeenCalledWith(
          200,
          expect.objectContaining({ ETag: `"${VALID_CID_V0}"` })
        )
      })
    })
  })

  describe('when the CID is a valid CIDv1', () => {
    beforeEach(() => {
      req.params = { cid: VALID_CID_V1, size: '256' }
      jest.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 50 } as fs.Stats)
      jest.spyOn(fs, 'createReadStream').mockReturnValue(new PassThrough() as any)
    })

    it('should respond with 200', async () => {
      await getResizedImage(fetcher, '/tmp/test-storage', req, res)

      expect(writeHeadFn).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Length': 50 }))
    })
  })

  describe('when the CID contains path traversal characters', () => {
    beforeEach(() => {
      req.params = { cid: '../../etc/passwd', size: '128' }
    })

    it('should respond with a 400 and an invalid CID error', async () => {
      await getResizedImage(fetcher, '/tmp/test-storage', req, res)

      expect(statusFn).toHaveBeenCalledWith(400)
      expect(sendFn).toHaveBeenCalledWith(expect.stringContaining('Invalid CID'))
    })
  })

  describe('when the CID contains special characters', () => {
    beforeEach(() => {
      req.params = { cid: 'abc!@#$%^&*()def'.padEnd(46, 'x'), size: '128' }
    })

    it('should respond with a 400 and an invalid CID error', async () => {
      await getResizedImage(fetcher, '/tmp/test-storage', req, res)

      expect(statusFn).toHaveBeenCalledWith(400)
      expect(sendFn).toHaveBeenCalledWith(expect.stringContaining('Invalid CID'))
    })
  })

  describe('when the CID is an empty string', () => {
    beforeEach(() => {
      req.params = { cid: '', size: '128' }
    })

    it('should respond with a 400 and an invalid CID error', async () => {
      await getResizedImage(fetcher, '/tmp/test-storage', req, res)

      expect(statusFn).toHaveBeenCalledWith(400)
      expect(sendFn).toHaveBeenCalledWith(expect.stringContaining('Invalid CID'))
    })
  })

  describe('when the CID exceeds the maximum length', () => {
    beforeEach(() => {
      req.params = { cid: 'a'.repeat(200), size: '128' }
    })

    it('should respond with a 400 and an invalid CID error', async () => {
      await getResizedImage(fetcher, '/tmp/test-storage', req, res)

      expect(statusFn).toHaveBeenCalledWith(400)
      expect(sendFn).toHaveBeenCalledWith(expect.stringContaining('Invalid CID'))
    })
  })

  describe('when the CID is too short', () => {
    beforeEach(() => {
      req.params = { cid: 'Qmabc', size: '128' }
    })

    it('should respond with a 400 and an invalid CID error', async () => {
      await getResizedImage(fetcher, '/tmp/test-storage', req, res)

      expect(statusFn).toHaveBeenCalledWith(400)
      expect(sendFn).toHaveBeenCalledWith(expect.stringContaining('Invalid CID'))
    })
  })

  describe('when the upstream content server returns an unexpected error', () => {
    beforeEach(() => {
      req.params = { cid: VALID_CID_V0, size: '128' }
      jest.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('ENOENT'))
      jest.spyOn(fs, 'createReadStream').mockReturnValue(new PassThrough() as any)
      ;(fetch as unknown as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue('internal debug info: db connection failed at 10.0.0.5')
      })
    })

    it('should respond with a 500 and a generic error message', async () => {
      await getResizedImage(fetcher, '/tmp/test-storage', req, res)

      expect(statusFn).toHaveBeenCalledWith(500)
      expect(sendFn).toHaveBeenCalledWith(
        expect.not.stringContaining('internal debug info')
      )
    })
  })
})
