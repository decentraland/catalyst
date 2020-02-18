import fetch from "node-fetch"

const query = `
  query GetNameByBeneficiary($beneficiary: String) {
    nfts(where: { owner: $beneficiary, category: ens }) {
      ens {
        labelHash
        beneficiary
        caller
        subdomain
        createdAt
      }
    }
  }`

const opts = (ethAddress: string) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { beneficiary: ethAddress.toLowerCase() } })
})

export async function getOwnedENS(theGraphBaseUrl: string, ethAddress: string): Promise<string[]> {
    const totalAttempts = 5
    for(let attempt=0; attempt<totalAttempts; attempt++) {
        try {
            const response = await fetch(theGraphBaseUrl, opts(ethAddress))
            if (response.ok) {
                const jsonResponse: GraphResponse = await response.json()
                return jsonResponse.data.nfts.map(nft => nft.ens.subdomain)
            }
        } catch (error) {
            console.log(`Could not retrieve ENS for address ${ethAddress}. Try ${attempt} of ${totalAttempts}.`, error)
        }
    }
    return []
}

type GraphResponse = {
    data: {
        nfts: {
            ens: {
                subdomain: string
            }
        }[]
    }
}

