import { v4 as uuidv4 } from 'uuid'

export type IChallengeSupervisor = {
  getChallengeText(): ChallengeText
  isChallengeOk(text: ChallengeText): boolean
}

/**
 * This class will handle the challenge. The idea is for each server to figure out their identity on the DAO by themselves, so they will
 * generate a random challenge text, and then query each server for it. If the text matches, then they have found themselves.
 */
export class ChallengeSupervisor implements IChallengeSupervisor {
  private readonly challengeText: ChallengeText

  constructor() {
    this.challengeText = uuidv4()
  }

  getChallengeText(): ChallengeText {
    return this.challengeText
  }

  isChallengeOk(text: ChallengeText) {
    return this.challengeText === text
  }
}

export type ChallengeText = string
