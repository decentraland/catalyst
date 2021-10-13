import { Authenticator, AuthLink, EthAddress } from 'dcl-crypto'
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
/**
 * Validates signature using header parameters. This should work with Kernel's Signed Fetch
 */
export function validateSignatureFromHeaderHandler(
  networkOrProvider: string | EthereumProvider,
  authorizedSignerPredicate: (signer: EthAddress | undefined, body: any) => boolean = (_, __) => true,
  signatureValidator: SignatureValidator = Authenticator.validateSignature
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const [chain, timestamp, metadata] = buildAuthChainFromHeaders(req)

    if (!timestamp) {
      res.status(401).send({
        status: 'unauthorized',
        message: `Timestamp must be provided with the header ${AUTH_TIMESTAMP_HEADER}`
      })
      return
    }

    const signerData: SignerData = {
      authChain: chain,
      timestamp
    }

    const payloadParts = [req.method.toLowerCase(), req.originalUrl.toLowerCase(), timestamp.toString(), metadata]
    const signaturePayload = payloadParts.join(':').toLowerCase()

    validateSignature(
      signerData,
      signaturePayload,
      () => {
        req.params.address = chain[0].payload
        req.params.authMetadata = metadata
        next()
      },
      (message) => res.status(401).send({ status: 'unauthorized', message }),
      (signer) => authorizedSignerPredicate(signer, req.body),
      networkOrProvider,
      signatureValidator
    ).catch(next)
  }
}

export const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
export const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp'
export const AUTH_METADATA_HEADER = 'x-identity-metadata'

// We support up to 10 links in authchain.
function getAuthChainHeaders() {
  return [...new Array(10).keys()].map((idx) => `${AUTH_CHAIN_HEADER_PREFIX}${idx}`)
}

export const authHeaders = [AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER, ...getAuthChainHeaders()]

function extractIndex(header: string) {
  return parseInt(header.substring(AUTH_CHAIN_HEADER_PREFIX.length), 10)
}

function buildAuthChainFromHeaders(req: Request): [AuthLink[], number | undefined, string] {
  const chain = Object.keys(req.headers)
    .filter((header) => header.includes(AUTH_CHAIN_HEADER_PREFIX))
    .sort((a, b) => (extractIndex(a) > extractIndex(b) ? 1 : -1))
    .map((header) => JSON.parse(req.headers[header] as string) as AuthLink)

  const timestampString = req.header(AUTH_TIMESTAMP_HEADER)
  const metadata = req.header(AUTH_METADATA_HEADER)

  const timestamp = timestampString ? parseInt(timestampString, 10) : undefined
  return [chain, timestamp, metadata ?? '']
}
