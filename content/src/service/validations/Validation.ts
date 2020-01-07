
export enum Validation {
    SIGNATURE,
    REQUEST_SIZE,
    ACCESS,
    ENTITY_STRUCTURE,
    FRESHNESS,
    CONTENT,
    ENTITY_HASH,
}

export class Validations {

    static readonly ALL: Validations = new Validations(Object.keys(Validation).map(key => Validation[key]))
    static readonly SYNCED: Validations = Validations.ALL.without(Validation.FRESHNESS)
    static readonly OVERWRITE: Validations = Validations.SYNCED.without(Validation.CONTENT)
    static readonly BLACKLISTED_CONTENT: Validations = Validations.SYNCED.without(Validation.CONTENT)
    static readonly BLACKLISTED_ENTITY: Validations = Validations.BLACKLISTED_CONTENT.without(Validation.ENTITY_HASH)

    private readonly toExecute: Set<Validation>;
    private constructor (toExecute: Validation[]) {
        this.toExecute = new Set(toExecute)
    }

    shouldExecute(validation: Validation) {
        return this.toExecute.has(validation)
    }

    private without(...toRemove: Validation[]) {
        return new Validations(Array.from(this.toExecute)
            .filter(validation => !toRemove.includes(validation)))
    }

}