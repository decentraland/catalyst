import { IDatabase } from '@well-known-components/interfaces'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { AuthChain, AuthLinkType } from 'dcl-crypto'
import { stub } from 'sinon'
import {
  DeploymentDeltasRow,
  getPointerChangesForDeployments
} from '../../../src/logic/database-queries/deployment-deltas-queries'
import { metricsDeclaration } from '../../../src/metrics'
import { IDatabaseComponent } from '../../../src/ports/postgres'
import { DELTA_POINTER_RESULT } from '../../../src/service/pointers/PointerManager'

describe('deployment deltas queries', () => {
  describe('getPointerChangesForDeployments', () => {
    describe('when the deployment ids list is empty', () => {
      it('should return an empty map', async () => {
        expect(await getPointerChangesForDeployments({} as any, [])).toEqual(new Map())
      })
    })

    describe('when the deployment ids list is not empty', () => {
      it('should return a map that for each deployment has a map from pointer to the delta information', async () => {
        const database: IDatabaseComponent = { queryWithValues: () => undefined } as any
        const metrics = createTestMetricsComponent(metricsDeclaration)

        const repeatedDeploymentId = 1
        const anotherDeploymentId = 2
        const repeatedPointerId = 'repeatedPointer'
        const anotherPointerId = 'anotherPointer'
        const authChain: AuthChain = [
          { type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL, payload: 'payload', signature: 'signature' }
        ]
        const secondBefore = 'second'
        const anotherBefore = 'another'

        const dbResponse: IDatabase.IQueryResult<DeploymentDeltasRow> = {
          rows: [
            {
              deployment: repeatedDeploymentId,
              pointer: repeatedPointerId,
              before: undefined,
              after: DELTA_POINTER_RESULT.SET,
              auth_chain: authChain
            },
            {
              deployment: repeatedDeploymentId,
              pointer: repeatedPointerId,
              before: secondBefore,
              after: DELTA_POINTER_RESULT.SET,
              auth_chain: authChain
            },
            {
              deployment: repeatedDeploymentId,
              pointer: anotherPointerId,
              before: anotherBefore,
              after: DELTA_POINTER_RESULT.SET,
              auth_chain: authChain
            },
            {
              deployment: anotherDeploymentId,
              pointer: anotherPointerId,
              before: anotherBefore,
              after: DELTA_POINTER_RESULT.SET,
              auth_chain: authChain
            }
          ],
          rowCount: 4
        }

        const expected = new Map()
        const expectedMapForRepeatedDeployment = new Map()
        expectedMapForRepeatedDeployment.set(repeatedPointerId, {
          before: secondBefore,
          after: DELTA_POINTER_RESULT.SET,
          authChain
        })
        expectedMapForRepeatedDeployment.set(anotherPointerId, {
          before: anotherBefore,
          after: DELTA_POINTER_RESULT.SET,
          authChain
        })

        const expectedMapForAnotherDeployment = new Map()
        expectedMapForAnotherDeployment.set(anotherPointerId, {
          before: anotherBefore,
          after: DELTA_POINTER_RESULT.SET,
          authChain
        })

        expected.set(repeatedDeploymentId, expectedMapForRepeatedDeployment)
        expected.set(anotherDeploymentId, expectedMapForAnotherDeployment)

        stub(database, 'queryWithValues').resolves(dbResponse)
        expect(
          await getPointerChangesForDeployments({ database, metrics }, [repeatedDeploymentId, anotherDeploymentId])
        ).toEqual(expected)
      })
    })
  })
})
