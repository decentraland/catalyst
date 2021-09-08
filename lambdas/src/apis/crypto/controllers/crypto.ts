import { httpProviderForNetwork } from '@katalyst/contracts'
import { Authenticator, AuthLink, ValidationResult } from 'dcl-crypto'
import { Request, Response } from 'express'

export async function validateSignature(networkKey: string, req: Request, res: Response) {
  // Method: POST
  // Path: /validate-signature
  try {
    const timestamp: string | undefined = req.body.timestamp
    const signedMessage: string | undefined = req.body.signedMessage
    const authChain: AuthLink[] = req.body.authChain
    const finalAuthority: string | undefined = signedMessage ?? timestamp
    if (!finalAuthority) {
      return res.status(400).send(`Expected 'signedMessage' property to be set`)
    }

    const result: ValidationResult = await Authenticator.validateSignature(
      finalAuthority,
      authChain,
      httpProviderForNetwork(networkKey)
    )

    res.send({
      valid: result.ok,
      ownerAddress: result.ok ? Authenticator.ownerAddress(authChain) : undefined,
      error: result.message
    })
  } catch (e) {
    res.status(400).send(`Unexpected error: ${e}`)
  }
}
