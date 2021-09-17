import { Authenticator, EthAddress } from 'dcl-crypto'
import { NextFunction, Request, RequestHandler, Response } from 'express'
import { EthereumProvider } from 'web3x/providers'
import { SignatureValidator, SignerData, validateSignature } from './signatures'

/**
 * @param messageToSignBuilder Function to build the signature payload to test against. Keep in mind that the timestamp will be appended to the result.
 * @param signerDataBuilder Function to build the signer data. By default, it tries to get all the data from the root of the body.
 * @param authorizedSignerPredicate Predicate to check if the signer is authorized to perform this operation. By default it is always authorized.
 * @param networkOrProvider Parameter to use to create the EthereumProvider to validate the signature. If it is a string, it is interpreted as the network name and an HTTP Provider is used.
 */
export function validateSignatureHandler(
  messageToSignBuilder: (body: any) => string,
  networkOrProvider: string | EthereumProvider,
  authorizedSignerPredicate: (signer: EthAddress | undefined, body: any) => boolean = (_, __) => true,
  signerDataBuilder: (body: any) => SignerData = (b) => b,
  signatureValidator: SignatureValidator = Authenticator.validateSignature
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const signerData = signerDataBuilder(req.body)

    validateSignature(
      signerData,
      `${messageToSignBuilder(req.body)}${signerData.timestamp}`,
      next,
      (message) => res.status(401).send({ status: 'unauthorized', message }),
      (signer) => authorizedSignerPredicate(signer, req.body),
      networkOrProvider,
      signatureValidator
    ).catch(next)
  }
}
