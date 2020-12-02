import { Fetcher } from 'dcl-catalyst-commons'

const query = `
    query FilterNamesByOwner($owner: String, $names: [String]) {
        nfts(
            where: {
                owner: $owner,
                name_in: $names,
                category: ens }) {
            name
        }
    }`

export async function filterENS(
  fetcher: Fetcher,
  theGraphBaseUrl: string,
  ethAddress: string,
  namesToFilter: string[]
): Promise<string[]> {
  const variables = {
    owner: ethAddress.toLowerCase(),
    names: namesToFilter
  }
  try {
    const response = fetcher.queryGraph<{ nfts: { name: string }[] }>(theGraphBaseUrl, query, variables)
    return (await response).nfts.map((nft) => nft.name)
  } catch (error) {
    console.log(`Could not retrieve ENSs for address ${ethAddress}.`, error)
  }
  return []
}
