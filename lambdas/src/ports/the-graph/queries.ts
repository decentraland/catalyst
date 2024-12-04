const COLLECTIONS = `
{
  collections (first: 1000, orderBy: urn, orderDirection: asc) {
    urn,
    name,
  }
}`

const THIRD_PARTIES = `
{
  thirdParties(where: {isApproved: true}) {
    id
        metadata {
      thirdParty {
        name
        description
      }
    }
  }
}
`

const THIRD_PARTY_RESOLVER = `
query ThirdPartyResolver($id: String!) {
  thirdParties(where: {id: $id, isApproved: true}) {
    id
    resolver
  }
}
`

const ITEMS_BY_OWNER = `
query itemsByOwner($owner: String, $item_types:[String], $first: Int, $start: String) {
  nfts(where: {owner_: {address: $owner}, searchItemType_in: $item_types, id_gt: $start}, first: $first) {
    id
    urn
    collection {
      isApproved
    }
  }
}`

export { COLLECTIONS, ITEMS_BY_OWNER, THIRD_PARTIES, THIRD_PARTY_RESOLVER }
