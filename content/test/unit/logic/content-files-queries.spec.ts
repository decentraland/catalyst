import { restore, stub } from 'sinon'
import { AppComponents } from 'src/types'
import { ContentFilesRow, getContentFiles } from '../../../src/logic/database-queries/content-files-queries'

describe('content files queries', () => {
  describe('getContentFiles', () => {
    const components: Pick<AppComponents, 'database'> = { database: { queryWithValues: () => {} } } as any

    const deploymentIds = [127, 255]

    const content_files_response: ContentFilesRow[] = [
      {
        content_hash: 'hash',
        deployment: deploymentIds[0],
        key: '1'
      },
      {
        content_hash: 'hash2',
        deployment: deploymentIds[0],
        key: '2'
      },
      {
        content_hash: 'hash3',
        deployment: deploymentIds[1],
        key: '2'
      }
    ]

    beforeAll(() => {
      stub(components.database, 'queryWithValues').resolves({
        rows: content_files_response,
        rowCount: 2
      })
    })

    afterAll(() => {
      restore()
    })

    it('should return a map from deployment id to an array of content', async () => {
      const result = await getContentFiles(components, deploymentIds)
      expect(result).toEqual(
        jasmine.mapContaining(
          new Map([
            [
              deploymentIds[0],
              [
                { key: content_files_response[0].key, hash: content_files_response[0].content_hash },
                { key: content_files_response[1].key, hash: content_files_response[1].content_hash }
              ]
            ],
            [deploymentIds[1], [{ key: content_files_response[2].key, hash: content_files_response[2].content_hash }]]
          ])
        )
      )
    })
  })
})
