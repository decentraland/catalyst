import { v4 as uuidv4 } from 'uuid'
import { IChallengeSupervisor } from './types'

/**
 * Handles the challenge protocol used so each server can figure out its own identity on the DAO.
 * The server generates a random challenge text on startup and queries every DAO server for it.
 * If a server replies with the matching text, it has found itself.
 */
export function createChallengeSupervisor(): IChallengeSupervisor {
  const challengeText = uuidv4()

  return {
    getChallengeText(): string {
      return challengeText
    },
    isChallengeOk(text: string): boolean {
      return challengeText === text
    }
  }
}
