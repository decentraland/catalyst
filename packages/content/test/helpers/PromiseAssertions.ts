import assert from "assert"

export function assertPromiseIsRejected(promiseExecution: () => Promise<any>): Promise<void> {
    return assertPromiseRejectionGeneric(promiseExecution, () => { })
}

export function assertPromiseRejectionIs(promiseExecution: () => Promise<any>, errorMessage: string): Promise<void> {
    return assertPromiseRejectionGeneric(promiseExecution, returnedMessage => assert.equal(returnedMessage, errorMessage))
}

function assertPromiseRejectionGeneric(promiseExecution: () => Promise<any>, evaluation: (error: string) => void): Promise<void> {
    return promiseExecution()
        .then(() => { throw new Error("Expected an error, but nothing failed") })
        .catch(error => evaluation(error.message))
}