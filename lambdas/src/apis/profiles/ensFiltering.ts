export function ownsENS(ethAddress: string, ens: string): Promise<boolean> {
    return Promise.resolve(ENS_TABLE.filter(item => item.ens===ens && item.ethAddress===ethAddress).length > 0)
}

const ENS_TABLE: {ens:string, ethAddress:string}[] = [
    {ens: "Skeenee", ethAddress: "0x187dad1e0dd5e599091c2ec88e89afb4cde4b7a3"},
]