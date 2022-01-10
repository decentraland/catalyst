import express from 'express'
import { IdService } from '../src/peers/idService'

require('isomorphic-fetch')

describe('id service generation', function () {

  let idService: IdService

  beforeEach(() => {
    idService = new IdService({ idLength: 2 })
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
    const server = app.listen(port, async () => {
      for (let i = 0; i < idService.config.alphabet.length * idService.config.alphabet.length; i++) {
        const id = idService.nextId()
        requestedIds.push(id)
        const res = await fetch(`http://localhost:${port}/foo/${encodeURIComponent(id)}`)
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.id).toEqual(id)
      }

      expect(requestedIds).toEqual(receivedIds)
      server.close(() => done())
    })
  }, 30000)
})
