import { HTTPProvider, RPCSendableMessage, toBatchPayload } from 'eth-connect'

export const erc721Abi = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
]

export const erc1155Abi = [
  {
    inputs: [
      { internalType: 'address', name: 'account', type: 'address' },
      { internalType: 'uint256', name: 'id', type: 'uint256' }
    ],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
]

export function sendBatch(provider: HTTPProvider, batch: RPCSendableMessage[]) {
  const payload = toBatchPayload(batch)
  return new Promise<any>((resolve, reject) => {
    provider.sendAsync(payload as any, (err: any, result: any) => {
      if (err) {
        reject(err)
        return
      }

      resolve(result)
    })
  })
}

export async function sendSingle(provider: HTTPProvider, message: RPCSendableMessage) {
  const res = await sendBatch(provider, [message])
  return res[0]
}
