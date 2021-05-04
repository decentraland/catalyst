import { Entity, EntityType } from '@katalyst/content/service/Entity'
import { SQSDeploymentReporter } from '@katalyst/content/service/reporters/SQSDeploymentReporter'

describe('SQS Deployment Reporter', () => {
  const MAX_SAFE_TIMEOUT = Math.pow(2, 31) - 1

  it(
    `Simple event reporting`,
    async () => {
      const sqsAccessKey = process.env.SQS_ACCESS_KEY_ID ?? ''
      const sqsSecretKey = process.env.SQS_SECRET_ACCESS_KEY ?? ''
      const sqsQueueUrl = process.env.SQS_QUEUE_URL_REPORTING ?? ''
      console.log(`sqsAccessKey: ${sqsAccessKey}`)
      console.log(`sqsSecretKey: ${sqsSecretKey}`)
      console.log(`sqsQueueUrl : ${sqsQueueUrl}`)
      const result: { error?: string; messageId?: string } = await new Promise((resolve) => {
        const sqsReporter = new SQSDeploymentReporter(sqsAccessKey, sqsSecretKey, sqsQueueUrl, (error, messageId) => {
          resolve({ error, messageId })
        })
        const timestamp = new Date().getTime()
        const entity: Entity = new Entity(`id-${timestamp}`, EntityType.SCENE, [], timestamp)
        sqsReporter.reportDeployment(entity, 'ethAddress', 'integration-test')
      })
      expect(result.error).toBeUndefined()
      expect(result.messageId).toBeDefined()
    },
    MAX_SAFE_TIMEOUT
  )
})
