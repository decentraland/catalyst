import v4 from 'uuid/v4';

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