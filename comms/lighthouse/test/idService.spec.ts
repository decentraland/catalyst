import express from 'express'
import { IdService } from '../src/idService'

require('isomorphic-fetch')

describe('id service generation', function () {
  let originalTimeout

  let idService: IdService

  beforeEach(() => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000
    idService = new IdService()
  })

  afterEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
  })

  it('generates an id', () => {
    expect(idService.nextId()).toBe('00')
  })

  it('generates secuential id', () => {
    idService.nextId()
    expect(idService.nextId()).toBe('01')
  })

  it('can cycle to the next character in the id', () => {
    for (let i = 0; i < idService.config.alphabet.length; i++) {
      idService.nextId()
    }

    expect(idService.nextId()).toBe('10')
  })

  it('can cycle to the first id after the last id', () => {
    for (let i = 0; i < idService.config.alphabet.length * idService.config.alphabet.length; i++) {
      idService.nextId()
    }

    expect(idService.nextId()).toBe('00')
  })

  it('can use all ids in urls', (done) => {
    const app = express()

    const requestedIds: string[] = []
    const receivedIds: string[] = []

    app.get('/foo/:id', (req, res) => {
      receivedIds.push(req.params.id)
      res.status(200).send({ id: req.params.id })
    })

    const port = 19992 + Math.floor(Math.random() * 10000)

    app.listen(port, async () => {
      for (let i = 0; i < idService.config.alphabet.length * idService.config.alphabet.length; i++) {
        const id = idService.nextId()
        requestedIds.push(id)
        const res = await fetch(`http://localhost:${port}/foo/${encodeURIComponent(id)}`)
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.id).toEqual(id)
      }

      expect(requestedIds).toEqual(receivedIds)
      done()
    })
  }, 30000)
})
