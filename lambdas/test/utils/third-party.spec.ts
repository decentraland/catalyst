import { buildRegistryOwnerUrl, createThirdPartyFetcher } from '../../src/utils/third-party'

describe('Third Party', () => {
  describe('buildRegistryOwnerUrl', () => {
    const registryId: string = 'baby-doge-coin'
    const owner: string = '0x1b8ba74cc34c2927aac'

    it('should append the correct url', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual(
        'https://decentraland-api.babydoge.com/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets'
      )
    })

    it('should remove leading char', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual(
        'https://decentraland-api.babydoge.com/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets'
      )
    })

    it('should append prefix', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/v1'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual(
        'https://decentraland-api.babydoge.com/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets'
      )
    })
    it('should append prefix with leading', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/v1/'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual(
        'https://decentraland-api.babydoge.com/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets'
      )
    })

    it('should append compound prefix', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/base/v1'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual(
        'https://decentraland-api.babydoge.com/base/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets'
      )
    })
    it('should append compound prefix with leading', async () => {
      const baseUrl = 'https://decentraland-api.babydoge.com/base/v1/'
      const url = buildRegistryOwnerUrl(baseUrl, registryId, owner)

      expect(url).toEqual(
        'https://decentraland-api.babydoge.com/base/v1/registry/baby-doge-coin/address/0x1b8ba74cc34c2927aac/assets'
      )
    })
  })
  describe('createThirdPartyFetcher', () => {
    it('should iterate until all assets have been fetched', async () => {
      const httpFetcher = {
        fetch: jest
          .fn()
          .mockReturnValueOnce({
            json: () =>
              Promise.resolve({
                address: '0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198',
                assets: [
                  {
                    id: '0x28ccbe824455a3b188c155b434e4e628babb6ffa:284',
                    amount: 1,
                    urn: {
                      decentraland:
                        'urn:decentraland:matic:collections-thirdparty:cryptoavatars:0x28ccbe824455a3b188c155b434e4e628babb6ffa:284'
                    }
                  }
                ],
                total: 2,
                page: 1,
                next: 'https://api.cryptoavatars.io/registry/cryptoavatars/address/0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198/assets?skip=1&limit=1'
              })
          })
          .mockReturnValueOnce({
            json: () =>
              Promise.resolve({
                address: '0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198',
                assets: [
                  {
                    id: '0x28ccbe824455a3b188c155b434e4e628babb6ffa:661',
                    amount: 1,
                    urn: {
                      decentraland:
                        'urn:decentraland:matic:collections-thirdparty:cryptoavatars:0x28ccbe824455a3b188c155b434e4e628babb6ffa:661'
                    }
                  }
                ],
                total: 2,
                page: 2
              })
          })
      }

      const thirdPartyFetcher = createThirdPartyFetcher(httpFetcher)
      const assets = await thirdPartyFetcher.fetchAssets(
        'https://api.cryptoavatars.io',
        'cryptoavatars',
        '0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198'
      )

      expect(assets).toHaveLength(2)
      expect(assets).toEqual([
        {
          id: '0x28ccbe824455a3b188c155b434e4e628babb6ffa:284',
          amount: 1,
          urn: {
            decentraland:
              'urn:decentraland:matic:collections-thirdparty:cryptoavatars:0x28ccbe824455a3b188c155b434e4e628babb6ffa:284'
          }
        },
        {
          id: '0x28ccbe824455a3b188c155b434e4e628babb6ffa:661',
          amount: 1,
          urn: {
            decentraland:
              'urn:decentraland:matic:collections-thirdparty:cryptoavatars:0x28ccbe824455a3b188c155b434e4e628babb6ffa:661'
          }
        }
      ])
      expect(httpFetcher.fetch).toHaveBeenCalledTimes(2)
    })
    it('should stop iteration if no assets were returned', async () => {
      const httpFetcher = {
        fetch: jest
          .fn()
          .mockReturnValueOnce({
            json: () =>
              Promise.resolve(undefined)
          })
      }

      const thirdPartyFetcher = createThirdPartyFetcher(httpFetcher)
      const assets = await thirdPartyFetcher.fetchAssets(
        'https://api.cryptoavatars.io',
        'cryptoavatars',
        '0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198'
      )

      expect(assets).toHaveLength(0)
      expect(httpFetcher.fetch).toHaveBeenCalledTimes(1)
    })
    it('should throw error if error occurred while fetching assets', async () => {
      const httpFetcher = {
        fetch: jest
          .fn()
          .mockRejectedValueOnce(undefined)
      }

      const thirdPartyFetcher = createThirdPartyFetcher(httpFetcher)
      await expect(thirdPartyFetcher.fetchAssets(
        'https://api.cryptoavatars.io',
        'cryptoavatars',
        '0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198'
      )).rejects.toThrow("Error fetching assets with owner: 0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198, url: https://api.cryptoavatars.io and registryId: cryptoavatars")
      expect(httpFetcher.fetch).toHaveBeenCalledTimes(1)
    })
  })
})
