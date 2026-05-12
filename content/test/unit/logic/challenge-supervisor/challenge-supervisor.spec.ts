import {
  createChallengeSupervisor,
  IChallengeSupervisor
} from '../../../../src/logic/challenge-supervisor'

describe('when creating a challenge supervisor', () => {
  let supervisor: IChallengeSupervisor

  beforeEach(() => {
    supervisor = createChallengeSupervisor()
  })

  it('should expose a non-empty challenge text', () => {
    expect(supervisor.getChallengeText()).toEqual(expect.any(String))
    expect(supervisor.getChallengeText().length).toBeGreaterThan(0)
  })

  it('should return the same challenge text on repeated calls', () => {
    expect(supervisor.getChallengeText()).toBe(supervisor.getChallengeText())
  })
})

describe('when checking whether a text matches the challenge', () => {
  let supervisor: IChallengeSupervisor

  beforeEach(() => {
    supervisor = createChallengeSupervisor()
  })

  describe('and the text equals the supervisor challenge text', () => {
    it('should return true', () => {
      expect(supervisor.isChallengeOk(supervisor.getChallengeText())).toBe(true)
    })
  })

  describe('and the text differs from the supervisor challenge text', () => {
    it('should return false', () => {
      expect(supervisor.isChallengeOk(`${supervisor.getChallengeText()}-tampered`)).toBe(false)
    })
  })

  describe('and the text is empty', () => {
    it('should return false', () => {
      expect(supervisor.isChallengeOk('')).toBe(false)
    })
  })
})

describe('when creating multiple challenge supervisors', () => {
  let first: IChallengeSupervisor
  let second: IChallengeSupervisor

  beforeEach(() => {
    first = createChallengeSupervisor()
    second = createChallengeSupervisor()
  })

  it('should generate a different challenge text for each instance', () => {
    expect(first.getChallengeText()).not.toBe(second.getChallengeText())
  })

  it('should not accept the other instance challenge text as a match', () => {
    expect(first.isChallengeOk(second.getChallengeText())).toBe(false)
    expect(second.isChallengeOk(first.getChallengeText())).toBe(false)
  })
})
