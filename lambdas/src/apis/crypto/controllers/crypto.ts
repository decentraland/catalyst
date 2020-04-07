import { Request, Response } from 'express'
import { Environment, EnvironmentConfig } from '../../../Environment'
import { Timestamp, AuthLink, Authenticator, ValidationResult } from 'dcl-crypto';
import { httpProviderForNetwork } from 'decentraland-katalyst-contracts/utils';

export async function validateSignature(env: Environment, req: Request, res: Response) {
    // Method: POST
    // Path: /validate-signature
    const timestamp: Timestamp  = req.body.timestamp;
    const authChain: AuthLink[] = req.body.authChain;

    const result: ValidationResult = await Authenticator.validateSignature(timestamp.toString(), authChain, httpProviderForNetwork(env.getConfig(EnvironmentConfig.ETH_NETWORK)))

    res.send({
        valid: result.ok,
        ownerAddress: result.ok ? Authenticator.ownerAddress(authChain) : undefined,
        error: result.message
    })
}

