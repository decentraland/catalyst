import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Entity type parsing', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  describe.each([
    ['pointer-changes', (type: string) => `/pointer-changes?entityType=${type}`, 200],
    ['deployments', (type: string) => `/deployments?entityType=${type}`, 200],
    ['entities', (type: string) => `/entities/${type}?pointer=0,0`, 200],
    ['audit', (type: string) => `/audit/${type}/non-existent-entity`, 404]
  ])('when requesting the %s endpoint', (_name, buildPath, okStatus) => {
    let status: number

    describe('and the entity type is "outfits"', () => {
      beforeEach(async () => {
        status = (await fetch(server.getUrl() + buildPath('outfits'))).status
      })

      it(`should not reject the entity type`, () => {
        expect(status).toBe(okStatus)
      })
    })

    describe('and the entity type is the plural "scenes"', () => {
      beforeEach(async () => {
        status = (await fetch(server.getUrl() + buildPath('scenes'))).status
      })

      it(`should not reject the entity type`, () => {
        expect(status).toBe(okStatus)
      })
    })

    describe('and the entity type is "outfitss"', () => {
      beforeEach(async () => {
        status = (await fetch(server.getUrl() + buildPath('outfitss'))).status
      })

      it('should respond with a 400', () => {
        expect(status).toBe(400)
      })
    })
  })
})
