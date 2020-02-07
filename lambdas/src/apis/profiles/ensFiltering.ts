import fetch from "node-fetch"

const query = `
  query GetNameByBeneficiary($beneficiary: String) {
    enss(where:{beneficiary:$beneficiary}) {
      labelHash
      beneficiary
      caller
      subdomain
      createdAt
    }
  }`

const opts = (ethAddress) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { beneficiary: ethAddress } })
})

export async function getOwnedENS(theGraphBaseUrl: string, ethAddress: string): Promise<string[]> {
    try {
        const response = await fetch(theGraphBaseUrl, opts(ethAddress))
        if (response.ok) {
            const jsonResponse: GraphResponse = await response.json()
            return jsonResponse.data.enss.map(registration => registration.subdomain)
        }
    } catch (error) {
        console.log(`Could not retrieve ENS for address ${ethAddress}.`, error)
    }
    return []
}

type GraphResponse = {
    data: {
        enss: {subdomain: string}[]
    }
}

