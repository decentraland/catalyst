import { restore, stub } from 'sinon'
import { AppComponents } from 'src/types'
import { getMigrationData } from '../../../src/logic/database-queries/migration-data-queries'

describe('migration-data-queries', () => {
  describe('getMigrationData', () => {
    const components: Pick<AppComponents, 'database'> = { database: { queryWithValues: () => {} } } as any

    const metadata1 = { a: 1, b: 2 }
    const metadata2 = { c: 1, d: 2 }

    const migration_data_response = [
      { deployment: 1, original_metadata: metadata1 },
      { deployment: 2, original_metadata: metadata2 }
    ]

    const deploymentIds = [1, 2]

    beforeAll(() => {
      stub(components.database, 'queryWithValues').resolves({
        rows: migration_data_response,
        rowCount: 2
      })
    })

    afterAll(() => {
      restore()
    })

    it('should return a map from deployment id to original metadata', async () => {
      const result = await getMigrationData(components, deploymentIds)
      expect(result).toEqual(
        jasmine.mapContaining(
          new Map([
            [deploymentIds[0], migration_data_response[0].original_metadata],
            [deploymentIds[1], migration_data_response[1].original_metadata]
          ])
        )
      )
    })
  })
})
