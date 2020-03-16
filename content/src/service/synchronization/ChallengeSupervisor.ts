import v4 from 'uuid/v4';

/**
 * This class will handle the challenge. The idea is for each server to figure out their identity on the DAO by themselves, so they will
 * generate a random challenge text, and then query each server for it. If the text matches, then they have found themselves.
 */
export class ChallengeSupervisor {

    private readonly challengeText: ChallengeText

    constructor() {
        this.challengeText = v4();
    }

    getChallengeText(): ChallengeText {
        return this.challengeText
    }

    isChallengeOk(text: ChallengeText) {
        return this.challengeText === text
    }

}

export type ChallengeText = string