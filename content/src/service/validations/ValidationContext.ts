
export enum Validation {
    SIGNATURE,
    REQUEST_SIZE,
    ACCESS,
    ENTITY_STRUCTURE,
    NO_NEWER,
    RECENT,
    NO_REDEPLOYS,
    PREVIOUS_DEPLOYMENT_STATUS,
    LEGACY_ENTITY,
    CONTENT,
    ENTITY_HASH,
    DECENTRALAND_ADDRESS,
}

export class ValidationContext {

    static readonly ALL: ValidationContext = new ValidationContext(Object.keys(Validation).map(key => Validation[key]))
    static readonly LOCAL: ValidationContext = ValidationContext.ALL.without(Validation.PREVIOUS_DEPLOYMENT_STATUS)
    static readonly FIX_ATTEMPT: ValidationContext = ValidationContext.ALL
    static readonly SYNCED: ValidationContext = ValidationContext.ALL.without(Validation.NO_NEWER, Validation.RECENT, Validation.NO_REDEPLOYS, Validation.PREVIOUS_DEPLOYMENT_STATUS)
    static readonly OVERWRITE: ValidationContext = ValidationContext.SYNCED.without(Validation.CONTENT)
    static readonly BLACKLISTED_CONTENT: ValidationContext = ValidationContext.SYNCED.without(Validation.CONTENT)
    static readonly BLACKLISTED_ENTITY: ValidationContext = ValidationContext.BLACKLISTED_CONTENT.without(Validation.ENTITY_HASH)

    private readonly toExecute: Set<Validation>;
    private constructor (toExecute: Validation[]) {
        this.toExecute = new Set(toExecute)
    }

    shouldValidate(validation: Validation) {
        return this.toExecute.has(validation)
    }

    private without(...toRemove: Validation[]) {
        return new ValidationContext(Array.from(this.toExecute)
            .filter(validation => !toRemove.includes(validation)))
    }

}