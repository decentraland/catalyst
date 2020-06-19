
export enum Validation {
    SIGNATURE,
    REQUEST_SIZE,
    ACCESS,
    ENTITY_STRUCTURE,
    NO_NEWER,
    RECENT,
    NO_REDEPLOYS,
    MUST_HAVE_FAILED_BEFORE,
    LEGACY_ENTITY,
    CONTENT,
    ENTITY_HASH,
    DECENTRALAND_ADDRESS,
}

export class ValidationContext {

    static readonly ALL: ValidationContext = new ValidationContext(Object.keys(Validation).map(key => Validation[key]))
    static readonly LOCAL: ValidationContext = ValidationContext.ALL.without(Validation.MUST_HAVE_FAILED_BEFORE, Validation.DECENTRALAND_ADDRESS, Validation.LEGACY_ENTITY)
    static readonly LOCAL_LEGACY_ENTITY: ValidationContext = ValidationContext.ALL.without(Validation.MUST_HAVE_FAILED_BEFORE, Validation.REQUEST_SIZE, Validation.ACCESS)
    static readonly SYNCED: ValidationContext = ValidationContext.LOCAL.without(Validation.NO_NEWER, Validation.RECENT, Validation.REQUEST_SIZE, Validation.NO_REDEPLOYS)
    static readonly SYNCED_LEGACY_ENTITY: ValidationContext = ValidationContext.LOCAL_LEGACY_ENTITY.without(Validation.NO_NEWER, Validation.RECENT, Validation.NO_REDEPLOYS)
    static readonly OVERWRITTEN: ValidationContext = ValidationContext.SYNCED.without(Validation.CONTENT)
    static readonly OVERWRITTEN_LEGACY_ENTITY: ValidationContext = ValidationContext.SYNCED_LEGACY_ENTITY.without(Validation.CONTENT)
    static readonly FIX_ATTEMPT: ValidationContext = ValidationContext.ALL.without(Validation.REQUEST_SIZE, Validation.NO_NEWER, Validation.RECENT, Validation.DECENTRALAND_ADDRESS, Validation.LEGACY_ENTITY, Validation.NO_REDEPLOYS)

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