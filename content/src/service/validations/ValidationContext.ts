
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
    static readonly SYNCED: ValidationContext = ValidationContext.LOCAL.without(Validation.NO_NEWER, Validation.RECENT, Validation.NO_REDEPLOYS)
    static readonly OVERWRITE: ValidationContext = ValidationContext.SYNCED.without(Validation.CONTENT)
    static readonly FIX_ATTEMPT: ValidationContext = ValidationContext.ALL

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