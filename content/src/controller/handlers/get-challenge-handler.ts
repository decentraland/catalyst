import { GetChallenge200 } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types.js'

export async function getChallengeHandler(
  context: HandlerContextWithPath<'challengeSupervisor', '/challenge'>
): Promise<{ status: 200; body: GetChallenge200 }> {
  const challengeText = context.components.challengeSupervisor.getChallengeText()
  return {
    status: 200,
    body: { challengeText }
  }
}
