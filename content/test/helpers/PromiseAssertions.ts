import assert from "assert"

export function assertPromiseIsRejected(promiseExecution: () => Promise<any>): Promise<void> {
    return assertPromiseRejectionGeneric(promiseExecution, () => { })
}

export function assertPromiseRejectionIs(promiseExecution: () => Promise<any>, errorMessage: string): Promise<void> {
    return assertPromiseRejectionGeneric(promiseExecution, returnedMessage => assert.equal(returnedMessage, errorMessage))
}

export async function assertPromiseRejectionGeneric(promiseExecution: () => Promise<any>, evaluation: (error: string) => void): Promise<void> {
    try {
        await promiseExecution()
    } catch (error) {
        evaluation(error.message)
        return;
    }
    throw new Error("Expected an error, but nothing failed")
}