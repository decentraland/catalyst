import { EntityType } from '@dcl/schemas'
import { IBaseComponent } from '@well-known-components/interfaces'
import { saveFailedDeployment } from '../../../src/logic/database-queries/failed-deployments-queries'
import { FailedDeployment, FailureReason } from '../../../src/ports/failedDeployments'
import { AppComponents } from '../../../src/types'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('failed deployments - ', (testEnv) => {

  const startOptions = { started: jest.fn(), live: jest.fn(), getComponents: jest.fn() }
  const aFailedDeployment = {
    entityType: EntityType.PROFILE,
    entityId: 'id',
    failureTimestamp: 123,
    reason: FailureReason.DEPLOYMENT_ERROR,
    authChain: [],
    errorDescription: 'some-error'
  }

  testCaseWithComponents(
    testEnv,
    'should return no failed deployments after start if there no one in the db',
    async (components) => {
      await startComponentsWithBaseFailedDeployments(components, startOptions, [])

      const failedDeps = await components.failedDeployments.getAllFailedDeployments()

      expect(failedDeps).toHaveLength(0)
    }
  )

  testCaseWithComponents(
    testEnv,
    'should return all failed deployments from db after start',
    async (components) => {
      await startComponentsWithBaseFailedDeployments(components, startOptions, [aFailedDeployment])

      const failedDeps = await components.failedDeployments.getAllFailedDeployments()

      expect(failedDeps).toEqual(expect.arrayContaining([aFailedDeployment]))
    }
  )

  testCaseWithComponents(
    testEnv,
    'should find failed deploymenet by entity id after start',
    async (components) => {
      await startComponentsWithBaseFailedDeployments(components, startOptions, [aFailedDeployment])

      const failedDep = await components.failedDeployments.findFailedDeployment(aFailedDeployment.entityId)

      expect(failedDep).toEqual(aFailedDeployment)
    }
  )

  testCaseWithComponents(
    testEnv,
    'should remove failed deployment',
    async (components) => {
      await startComponentsWithBaseFailedDeployments(components, startOptions, [aFailedDeployment])

      await components.failedDeployments.removeFailedDeployment(aFailedDeployment.entityId)

      await restartFailedDeploymentsAndAssertStoredDeployments(components, startOptions, [])
    }
  )

  testCaseWithComponents(
    testEnv,
    'should report failure when there wasn`t a failed deployment with the same entity id',
    async (components) => {
      await startComponentsWithBaseFailedDeployments(components, startOptions, [aFailedDeployment])
      const newFailedDeployment = { ...aFailedDeployment, entityId: 'anotherId' }

      await components.failedDeployments.reportFailure(newFailedDeployment)

      await restartFailedDeploymentsAndAssertStoredDeployments(components, startOptions, [aFailedDeployment, newFailedDeployment])
    }
  )

  testCaseWithComponents(
    testEnv,
    'should report failed deployment and delete the previous one if there was one with the same entity id',
    async (components) => {
      await startComponentsWithBaseFailedDeployments(components, startOptions, [aFailedDeployment])
      const newFailedDeploymentWithSameId = {
        ...aFailedDeployment,
        failureTimestamp: aFailedDeployment.failureTimestamp + 10
      }

      await components.failedDeployments.reportFailure(newFailedDeploymentWithSameId)

      await restartFailedDeploymentsAndAssertStoredDeployments(components, startOptions, [newFailedDeploymentWithSameId])
    }
  )
})

async function startComponentsWithBaseFailedDeployments(
  components: Pick<AppComponents, 'database' | 'metrics' | 'failedDeployments'>,
  startOptions: IBaseComponent.ComponentStartOptions,
  baseFailedDeployments: FailedDeployment[]) {
  await startComponent(components.metrics, startOptions)
  await startComponent(components.database, startOptions)
  for (const failedDeployment of baseFailedDeployments) {
    await saveFailedDeployment(components, failedDeployment)
  }
  await startComponent(components.failedDeployments, startOptions)
}

async function startComponent(component: any, startOptions: IBaseComponent.ComponentStartOptions) {
  if (component.start) await component.start(startOptions)
}

/**
 * The failed deployments component is restarted so we can test that they are stored in database and not only in cache.
 */
async function restartFailedDeploymentsAndAssertStoredDeployments(
  components: Pick<AppComponents, 'failedDeployments'>,
  startOptions: IBaseComponent.ComponentStartOptions,
  storedFailedDeployments: FailedDeployment[]) {
  await startComponent(components.failedDeployments, startOptions)
  const failedDeps = await components.failedDeployments.getAllFailedDeployments()
  expect(failedDeps).toEqual(expect.arrayContaining(storedFailedDeployments))
}