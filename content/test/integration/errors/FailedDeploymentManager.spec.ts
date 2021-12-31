// import { createTestMetricsComponent } from '@well-known-components/metrics'
// import { EntityId, EntityType } from 'dcl-catalyst-commons'
// import { random } from 'faker'
// import { stopAllComponents } from '../../../src/logic/components-lifecycle'
// import { metricsDeclaration } from '../../../src/metrics'
// import {
//   DeploymentStatus,
//   FailedDeployment,
//   FailureReason,
//   NoFailure
// } from '../../../src/ports/FailedDeploymentsCache'
// import { Repository } from '../../../src/repository/Repository'
// import { RepositoryFactory } from '../../../src/repository/RepositoryFactory'
// import { DB_REQUEST_PRIORITY } from '../../../src/repository/RepositoryQueue'
// import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'

// loadStandaloneTestEnvironment()('Integration - Failed Deployments Manager', function (testEnv) {
//   function testCaseWithRepository(
//     name: string,
//     fn: (repository: Repository) => Promise<void>
//   ) {
//     it(name, async () => {
//       const env = await testEnv.getEnvForNewDatabase()
//       const metrics = createTestMetricsComponent(metricsDeclaration)
//       const repository = await RepositoryFactory.create({ env, metrics })
//       try {
//         await fn(repository)
//       } finally {
//         await stopAllComponents({ repository })
//       }
//     })
//   }

//   testCaseWithRepository(
//     `When failures are reported, then the last status is returned`,
//     async (repository) => {
//       const deployment = buildRandomDeployment()

//       await reportDeployment({ repository, deployment, reason: FailureReason.DEPLOYMENT_ERROR })

//       let status = await getDeploymentStatus(repository, deployment)
//       expect(status).toBe(FailureReason.DEPLOYMENT_ERROR)
//     }
//   )

//   testCaseWithRepository(`When failures are reported, then all are reported correctly`, async (repository) => {
//     const deployment1 = buildRandomDeployment()
//     const deployment2 = buildRandomDeployment()

//     reportDeployment({
//       repository,
//       deployment: deployment1,
//       reason: FailureReason.DEPLOYMENT_ERROR,
//       description: 'description'
//     })
//     reportDeployment({ repository, deployment: deployment2, reason: FailureReason.DEPLOYMENT_ERROR })

//     const [failed1, failed2]: Array<FailedDeployment> = getAllFailedDeployments()

//     assertFailureWasDueToDeployment(failed1, deployment2)
//     expect(failed1.reason).toBe(FailureReason.DEPLOYMENT_ERROR)
//     expect(failed1.errorDescription).toBeUndefined()
//     assertFailureWasDueToDeployment(failed2, deployment1)
//     expect(failed2.reason).toBe(FailureReason.DEPLOYMENT_ERROR)
//     expect(failed2.errorDescription).toEqual('description')
//   })

//   testCaseWithRepository(
//     `When successful deployment is reported, then all previous failures of such reported are deleted`,
//     async (repository) => {
//       const deployment = buildRandomDeployment()

//       reportDeployment({ repository, deployment, reason: FailureReason.DEPLOYMENT_ERROR })

//       reportSuccessfulDeployment(deployment.entityId)

//       const status = await getDeploymentStatus(repository, getAllFailedDeployments(), deployment)
//       expect(status).toBe(NoFailure.NOT_MARKED_AS_FAILED)
//     }
//   )

//   function assertFailureWasDueToDeployment(failedDeployment: FailedDeployment, deployment: FakeDeployment) {
//     expect(failedDeployment.entityId).toEqual(deployment.entityId)
//     expect(failedDeployment.entityType).toEqual(deployment.entityType)
//   }

//   function reportDeployment({
//     repository,
//     manager,
//     deployment,
//     reason,
//     description
//   }: {
//     repository: Repository
//     deployment: FakeDeployment
//     reason: FailureReason
//     description?: string
//   }): void {
//     const { entityType, entityId } = deployment
//     manager.reportFailure(entityType, entityId, reason, [], description)
//   }

//   function getDeploymentStatus(
//     repository: Repository,
//     deployment: FakeDeployment
//   ): Promise<DeploymentStatus> {
//     return repository.run(
//       (db) => getDeploymentStatus(deployment.entityType, deployment.entityId),
//       { priority: DB_REQUEST_PRIORITY.LOW }
//     )
//   }

//   function buildRandomDeployment(): FakeDeployment {
//     const event: FakeDeployment = {
//       entityType: EntityType.PROFILE,
//       entityId: random.alphaNumeric(10)
//     }
//     return event
//   }
// })

// type FakeDeployment = {
//   entityType: EntityType
//   entityId: EntityId
// }
