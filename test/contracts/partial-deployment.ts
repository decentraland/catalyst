/**
 * HTTP-only contract shared by Worlds and a Catalyst adapter. A fixture supplies an authorized scene
 * with at least two unique, initially absent content hashes; each case gets a fresh entity.
 */
export type PartialUploadFixture = {
  entityId: string
  contentHashes: string[]
  send(keys: string[]): Promise<{ status: number; json(): Promise<unknown> }>
}

/** Registers the common wire contract without depending on Worlds storage or scene lookup APIs. */
export function partialDeploymentContract(fixture: () => PartialUploadFixture): void {
  describe('when using the shared partial-deployment HTTP contract', () => {
    let upload: PartialUploadFixture

    beforeEach(() => {
      upload = fixture()
    })

    describe('and the first request contains only the manifest', () => {
      it('should return 202 and the outstanding hashes', async () => {
        const response = await upload.send([upload.entityId])
        expect({ status: response.status, body: await response.json() }).toEqual({
          status: 202,
          body: { missing: expect.arrayContaining(upload.contentHashes) }
        })
      })
    })

    describe('and the completion response is lost', () => {
      let firstCompletion: unknown
      let retryCompletion: unknown
      let statuses: number[]

      beforeEach(async () => {
        await upload.send([upload.entityId])
        const completing = await upload.send(upload.contentHashes)
        firstCompletion = await completing.json()
        // Exact request replay intentionally omits the manifest after pending state was deleted.
        const retry = await upload.send(upload.contentHashes)
        retryCompletion = await retry.json()
        statuses = [completing.status, retry.status]
      })

      it('should return the same completion body and timestamp', () => {
        expect({ statuses, retryCompletion }).toEqual({ statuses: [200, 200], retryCompletion: firstCompletion })
      })
    })

    describe('and the first request includes all content', () => {
      it('should publish immediately with a creation timestamp', async () => {
        const response = await upload.send([upload.entityId, ...upload.contentHashes])
        expect({ status: response.status, body: await response.json() }).toEqual({
          status: 200,
          body: expect.objectContaining({ creationTimestamp: expect.any(Number) })
        })
      })
    })
  })
}
