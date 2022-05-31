import { buildRegistryOwnerUrl } from "../../src/utils/third-party"

describe("Third Party", () => {
  describe('buildRegistryOwnerUrl', () => {
    const registryId: string = 'baby-doge-coin'
    const owner: string = '0x1b8ba74cc34c2927aac'

    it('should append the correct url', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual('https://decentraland-api.babydoge.com/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets')
    })

    it('should remove leading char', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual('https://decentraland-api.babydoge.com/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets')
    })

    it('should append prefix', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/v1'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual('https://decentraland-api.babydoge.com/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets')
    })
    it('should append prefix with leading', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/v1/'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual('https://decentraland-api.babydoge.com/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets')
    })

    it('should append compound prefix', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/base/v1'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual('https://decentraland-api.babydoge.com/base/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets')
    })
    it('should append compound prefix with leading', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/base/v1/'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual('https://decentraland-api.babydoge.com/base/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets')
    })

  })
})
