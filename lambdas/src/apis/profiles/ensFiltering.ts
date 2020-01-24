import fetch from "node-fetch"

const query = `
  query GetNameByBeneficiary($beneficiary: String) {
    nameRegistrations(where:{beneficiary:$beneficiary}) {
      labelHash
      beneficiary
      caller
      subdomain
      createdAt
    }
  }`
const url = "https://api.thegraph.com/subgraphs/name/nicosantangelo/testing";
const opts = (ethAddress) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { beneficiary: ethAddress } })
})

export async function getOwnedENS(ethAddress: string): Promise<string[]> {
    try {
        const response = await fetch(url, opts(ethAddress))
        if (response.ok) {
            const jsonResponse: GraphResponse = await response.json()
            return jsonResponse.data.nameRegistrations.map(registration => registration.subdomain)
        }
    } catch (error) {
        console.log(`Could not retrieve ENS for address ${ethAddress}.`, error)
    }
    return []
}

type GraphResponse = {
    data: {
        nameRegistrations: {subdomain: string}[]
    }
}

