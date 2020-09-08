import fetch from "node-fetch"

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

const opts = (ethAddress: string, names: string[]) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: {
        owner: ethAddress.toLowerCase(),
        names: names } })
})

export async function filterENS(theGraphBaseUrl: string, ethAddress: string, namesToFilter: string[]): Promise<string[]> {
    const totalAttempts = 5
    for(let attempt=0; attempt<totalAttempts; attempt++) {
        try {
            const response = await fetch(theGraphBaseUrl, opts(ethAddress, namesToFilter))
            if (response.ok) {
                const jsonResponse: GraphResponse = await response.json()
                return jsonResponse.data.nfts.map(nft => nft.name)
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
            name: string
        }[]
    }
}

