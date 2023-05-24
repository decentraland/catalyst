export const QUERIES = {
  COLLECTIONS: `
    {
      collections (first: 1000, orderBy: urn, orderDirection: asc) {
        urn,
        name,
      }
    }`,
  THIRD_PARTIES: `
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
    `,
  THIRD_PARTY_RESOLVER: `
    query ThirdPartyResolver($id: String!) {
      thirdParties(where: {id: $id, isApproved: true}) {
        id
        resolver
      }
    }
    `,
  ITEMS_BY_OWNER: `
    query itemsByOwner($owner: String, $item_types:[String], $first: Int, $start: String) {
      nfts(where: {owner: $owner, searchItemType_in: $item_types, id_gt: $start}, first: $first) {
        id
        urn
        collection {
          isApproved
        }
      }
    }`
}
