import {
  HandlerContextWithPath,
  InvalidRequestError,
  NotFoundError,
  parseEntityType,
  DeploymentField
} from '../../types'
import { AuditResponse } from '@dcl/catalyst-api-specs/lib/client'
import { getDeployments } from '../../logic/deployments'
import { AuditInfo } from '../../deployment-types'

// Method: GET
export async function getEntityAuditInformationHandler(
  context: HandlerContextWithPath<'database' | 'denylist' | 'metrics', '/audit/:type/:entityId'>
): Promise<{ status: 200; body: AuditResponse }> {
  const type = parseEntityType(context.params.type)
  const entityId = context.params.entityId

  // Validate type is valid
  if (!type) {
    throw new InvalidRequestError(`Unrecognized type: ${context.params.type}`)
  }

  const { deployments } = await getDeployments(context.components, context.components.database, {
    fields: [DeploymentField.AUDIT_INFO],
    filters: { entityIds: [entityId], entityTypes: [type] },
    includeDenylisted: true
  })

  if (deployments.length === 0) {
    throw new NotFoundError('No deployment found')
  }

  const { auditInfo } = deployments[0]
  const body: AuditInfo = {
    version: auditInfo.version,
    localTimestamp: auditInfo.localTimestamp,
    authChain: auditInfo.authChain,
    overwrittenBy: auditInfo.overwrittenBy,
    isDenylisted: auditInfo.isDenylisted,
    denylistedContent: auditInfo.denylistedContent
  }
  return {
    status: 200,
    body
  }
}
