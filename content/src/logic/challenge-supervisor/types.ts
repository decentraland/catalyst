export type IChallengeSupervisor = {
  getChallengeText(): string
  isChallengeOk(text: string): boolean
}
