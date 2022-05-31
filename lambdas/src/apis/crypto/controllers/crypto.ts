import { Authenticator, AuthLink, ValidationResult } from '@dcl/crypto'
import { Request, Response } from 'express'
import { HTTPProvider } from 'eth-connect'

export async function validateSignature(ethereumProvider: HTTPProvider, req: Request, res: Response) {
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

    const result: ValidationResult = await Authenticator.validateSignature(finalAuthority, authChain, ethereumProvider)

    res.send({
      valid: result.ok,
      ownerAddress: result.ok ? Authenticator.ownerAddress(authChain) : undefined,
      error: result.message
    })
  } catch (e) {
    res.status(400).send(`Unexpected error: ${e}`)
  }
}
